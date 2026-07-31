import { Instructor, User, Session, Attendance, Quiz, QuizResult, Course, Student, StudentLedger, Assignment, AssignmentSubmission, AssignmentResult, Batch } from '../models/index.js';
import { CustomError } from '../../utils/customError.js';
import { syncBatchesStatus } from '../utils/batchHelper.js';

/**
 * Get instructor profile populated with user details (auto-creates profile if missing for teacher user).
 */
export async function getInstructorProfile(userId) {
  let instructor = await Instructor.findOne({ userId }).populate({
    path: 'userId',
    select: 'name email mobileNo profileStatus',
  });
  if (!instructor) {
    const user = await User.findById(userId).select('name email mobileNo profileStatus');
    if (!user) {
      throw new CustomError('Instructor profile not found', 404);
    }
    instructor = await Instructor.create({
      userId: user._id,
      designation: 'Instructor',
      assignedBatches: [],
    });
    instructor = await Instructor.findById(instructor._id).populate({
      path: 'userId',
      select: 'name email mobileNo profileStatus',
    });
  }
  return instructor;
}

/**
 * Update instructor profile properties (designation, bio, photo, linkedIn) and associated User's name.
 */
export async function updateInstructorProfile(userId, updateData, profileImagePath) {
  let instructor = await Instructor.findOne({ userId });
  if (!instructor) {
    const user = await User.findById(userId);
    if (!user) {
      throw new CustomError('Instructor profile not found', 404);
    }
    instructor = await Instructor.create({
      userId: user._id,
      designation: 'Instructor',
      assignedBatches: [],
    });
  }

  const { name, phone, designation, specialization, bio, linkedInUrl } = updateData;

  if (name || phone) {
    const userUpdates = {};
    if (name) userUpdates.name = name;
    if (phone) userUpdates.mobileNo = phone;
    await User.findByIdAndUpdate(userId, userUpdates);
  }

  if (designation !== undefined) instructor.designation = designation;
  if (specialization !== undefined) instructor.specialization = specialization;
  if (bio !== undefined) instructor.bio = bio;
  if (linkedInUrl !== undefined) instructor.linkedInUrl = linkedInUrl;
  if (profileImagePath !== undefined) instructor.profileImage = profileImagePath;

  await instructor.save();

  return getInstructorProfile(userId);
}

/**
 * Retrieve instructor dashboard metrics using real DB sessions and batches.
 */
export async function getInstructorDashboard(userId) {
  let instructor = await Instructor.findOne({ userId });
  if (!instructor) {
    const user = await User.findById(userId);
    if (!user) {
      throw new CustomError('Instructor profile not found', 404);
    }
    instructor = await Instructor.create({
      userId: user._id,
      designation: 'Instructor',
      assignedBatches: [],
    });
  }

  const instructorIds = [instructor._id, userId];
  const assignedBatchIds = Array.isArray(instructor.assignedBatches) ? instructor.assignedBatches : [];

  const sessionFilter = {
    $or: [
      { instructorId: { $in: instructorIds } },
      { batchId: { $in: assignedBatchIds } },
    ],
  };

  // 1. Upcoming / Active Sessions for this instructor
  const upcomingSessions = await Session.find({
    ...sessionFilter,
    status: { $in: ['scheduled', 'Scheduled', 'in_progress', 'In Progress', 'live'] },
  }).sort({ sessionDateAndTime: 1 }).lean();

  // 2. Completed sessions for this instructor
  const completedSessions = await Session.find({
    ...sessionFilter,
    status: { $in: ['completed', 'Completed'] },
  }).lean();

  // 3. Pending Attendance Uploads
  const pendingAttendance = [];
  for (const session of completedSessions) {
    const attendanceExists = await Attendance.exists({
      $or: [{ sessionId: session._id }, { lectureId: session._id }]
    });
    if (!attendanceExists) {
      pendingAttendance.push(session);
    }
  }

  // 4. Pending Quiz Uploads
  const pendingQuiz = [];
  for (const session of completedSessions) {
    const quizExists = await Quiz.exists({
      $or: [{ sessionId: session._id }, { lectureId: session._id }]
    });
    const quizResultExists = await QuizResult.exists({
      $or: [{ sessionId: session._id }, { lectureId: session._id }, { quizId: session._id }]
    });

    if (!quizExists && !quizResultExists) {
      pendingQuiz.push(session);
    }
  }

  return {
    upcomingSessions,
    pendingAttendance,
    pendingQuiz,
  };
}

/**
 * Retrieve all real database batches associated with the instructor.
 */
export async function getInstructorBatches(userId) {
  let instructor = await Instructor.findOne({ userId });
  if (!instructor) {
    const user = await User.findById(userId);
    if (!user) {
      throw new CustomError('Instructor profile not found', 404);
    }
    instructor = await Instructor.create({
      userId: user._id,
      designation: 'Instructor',
      assignedBatches: [],
    });
  }

  // Fetch batches assigned to this instructor or linked via instructorId/instructorIds
  let batches = await Batch.find({
    $or: [
      { _id: { $in: instructor.assignedBatches || [] } },
      { instructorId: instructor._id },
      { instructorId: userId },
      { instructorIds: instructor._id },
      { instructorIds: userId },
    ]
  }).lean();

  // Fallback: If no specific batch assignment match found, return all active database batches
  if (batches.length === 0) {
    batches = await Batch.find().lean();
  }

  await syncBatchesStatus(batches);

  const enrichedBatches = await Promise.all(
    batches.map(async (batch) => {
      const realStudents = await Student.find({
        $or: [
          { batchId: batch._id },
          { _id: { $in: batch.studentIds || [] } },
        ],
      }).select('_id');

      const studentCount = realStudents.length;
      const lectureCount = await Session.countDocuments({ batchId: batch._id });

      return {
        ...batch,
        studentCount,
        lectureCount,
      };
    })
  );

  return enrichedBatches;
}

/**
 * Retrieve students enrolled in a batch along with their ledger details.
 */
export async function getStudentBreakdown(batchId) {
  const batch = await Batch.findById(batchId).lean();
  const studentIdsFromBatch = Array.isArray(batch?.studentIds) ? batch.studentIds : [];

  const students = await Student.find({
    $or: [
      { batchId: batchId },
      { _id: { $in: studentIdsFromBatch } },
    ],
  }).populate({
    path: 'userId',
    select: 'name email profileStatus',
  });

  // Auto-sync student batchId in database if out of sync
  for (const s of students) {
    if (s.batchId !== batchId) {
      await Student.updateOne({ _id: s._id }, { batchId });
    }
  }

  const studentIds = students.map((s) => s._id);

  const ledgerEntries = await StudentLedger.find({
    studentId: { $in: studentIds },
    deletedAt: null,
  }).sort({ createdAt: -1 });

  const studentsWithBreakdown = students.map((student) => {
    const studentLedger = ledgerEntries.filter((entry) => String(entry.studentId) === String(student._id));
    return {
      student,
      ledger: studentLedger,
    };
  });

  return studentsWithBreakdown;
}

/**
 * Retrieve metrics summary for a completed session.
 */
export async function getSessionSummary(sessionId) {
  const session = await Session.findById(sessionId);
  if (!session) {
    throw new CustomError('Session not found', 404);
  }

  // 1. Attendance Metrics
  const attendanceRecords = await Attendance.find({
    $or: [{ sessionId }, { lectureId: sessionId }]
  }).lean();

  const attendanceCounts = {
    present: 0,
    absent: 0,
    leave: 0,
    half: 0,
    total: attendanceRecords.length,
  };

  for (const record of attendanceRecords) {
    let st = record.status;
    if (!st) {
      if (record.first_half && record.second_half) st = 'present';
      else if (record.first_half || record.second_half) st = 'half';
      else st = 'absent';
    }
    if (attendanceCounts[st] !== undefined) {
      attendanceCounts[st]++;
    }
  }

  // 2. Average Quiz Score
  let avgQuizScore = 0;
  const quizResults = await QuizResult.find({
    $or: [{ sessionId }, { lectureId: sessionId }, { quizId: sessionId }]
  }).lean();

  if (quizResults.length > 0) {
    const sum = quizResults.reduce((acc, curr) => acc + (curr.marksObtained ?? curr.score ?? 0), 0);
    avgQuizScore = Math.round((sum / quizResults.length) * 10) / 10;
  } else {
    const quiz = await Quiz.findOne({ $or: [{ sessionId }, { lectureId: sessionId }] }).lean();
    if (quiz) {
      const results = await QuizResult.find({ quizId: quiz._id }).lean();
      if (results.length > 0) {
        const sum = results.reduce((acc, curr) => acc + (curr.marksObtained ?? curr.score ?? 0), 0);
        avgQuizScore = Math.round((sum / results.length) * 10) / 10;
      }
    }
  }

  // 3. Average Assignment Score
  let avgAssignmentScore = 0;
  const assignment = await Assignment.findOne({ $or: [{ sessionId }, { lectureId: sessionId }] }).lean();
  if (assignment) {
    const submissions = await AssignmentSubmission.find({ assignmentId: assignment._id }).lean();
    const submissionIds = submissions.map((s) => s._id);
    if (submissionIds.length > 0) {
      const results = await AssignmentResult.find({ submissionId: { $in: submissionIds } }).lean();
      if (results.length > 0) {
        const sum = results.reduce((acc, curr) => acc + (curr.marksObtained || 0), 0);
        avgAssignmentScore = Math.round((sum / results.length) * 10) / 10;
      }
    }
  }

  return {
    session,
    attendance: attendanceCounts,
    avgQuizScore,
    avgAssignmentScore,
  };
}
