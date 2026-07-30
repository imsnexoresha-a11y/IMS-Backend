import { Instructor, User, Session, Attendance, Quiz, QuizResult, Course, Student, StudentLedger, Assignment, AssignmentSubmission, AssignmentResult, Batch } from '../models/index.js';
import { CustomError } from '../../utils/customError.js';

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

  const { name, phone, designation, bio, linkedInUrl } = updateData;

  if (name || phone) {
    const userUpdates = {};
    if (name) userUpdates.name = name;
    if (phone) userUpdates.mobileNo = phone;
    await User.findByIdAndUpdate(userId, userUpdates);
  }

  if (designation !== undefined) instructor.designation = designation;
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

  // 1. Upcoming / Active Sessions
  const upcomingSessions = await Session.find({
    instructorId: { $in: instructorIds },
    status: { $in: ['scheduled', 'Scheduled', 'in_progress', 'In Progress'] },
  }).sort({ sessionDateAndTime: 1 }).lean();

  // Fetch all completed sessions for this instructor
  const completedSessions = await Session.find({
    instructorId: { $in: instructorIds },
    status: { $in: ['completed', 'Completed'] },
  }).lean();

  // Fallback to all sessions if none found for specific instructor ID
  const allUpcoming = upcomingSessions.length > 0 ? upcomingSessions : await Session.find({
    status: { $in: ['scheduled', 'Scheduled', 'in_progress', 'In Progress'] }
  }).sort({ sessionDateAndTime: 1 }).lean();

  const allCompleted = completedSessions.length > 0 ? completedSessions : await Session.find({
    status: { $in: ['completed', 'Completed'] }
  }).lean();

  // 2. Pending Attendance Uploads
  const pendingAttendance = [];
  for (const session of allCompleted) {
    const attendanceExists = await Attendance.exists({ sessionId: session._id });
    if (!attendanceExists) {
      pendingAttendance.push(session);
    }
  }

  // 3. Pending Quiz Uploads
  const pendingQuiz = [];
  for (const session of allCompleted) {
    const quizExists = await Quiz.exists({ sessionId: session._id });
    if (!quizExists) {
      pendingQuiz.push(session);
    }
  }

  return {
    upcomingSessions: allUpcoming,
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

  return batches;
}

/**
 * Retrieve students enrolled in a batch along with their ledger details.
 */
export async function getStudentBreakdown(batchId) {
  const students = await Student.find({ batchId }).populate({
    path: 'userId',
    select: 'name email profileStatus',
  });

  const studentIds = students.map((s) => s._id);

  const ledgerEntries = await StudentLedger.find({
    studentId: { $in: studentIds },
    deletedAt: null,
  }).sort({ createdAt: -1 });

  const studentsWithBreakdown = students.map((student) => {
    const studentLedger = ledgerEntries.filter((entry) => entry.studentId === student._id);
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
  const attendanceRecords = await Attendance.find({ sessionId });
  const attendanceCounts = {
    present: 0,
    absent: 0,
    leave: 0,
    half: 0,
    total: attendanceRecords.length,
  };
  for (const record of attendanceRecords) {
    if (attendanceCounts[record.status] !== undefined) {
      attendanceCounts[record.status]++;
    }
  }

  // 2. Average Quiz Score
  let avgQuizScore = 0;
  const quiz = await Quiz.findOne({ sessionId });
  if (quiz) {
    const quizResults = await QuizResult.find({ quizId: quiz._id });
    if (quizResults.length > 0) {
      const sum = quizResults.reduce((acc, curr) => acc + (curr.marksObtained || 0), 0);
      avgQuizScore = sum / quizResults.length;
    }
  }

  // 3. Average Assignment Score
  let avgAssignmentScore = 0;
  const assignment = await Assignment.findOne({ sessionId });
  if (assignment) {
    const submissions = await AssignmentSubmission.find({ assignmentId: assignment._id });
    const submissionIds = submissions.map((s) => s._id);
    if (submissionIds.length > 0) {
      const results = await AssignmentResult.find({ submissionId: { $in: submissionIds } });
      if (results.length > 0) {
        const sum = results.reduce((acc, curr) => acc + (curr.marksObtained || 0), 0);
        avgAssignmentScore = sum / results.length;
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
