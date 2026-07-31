import {
  Assignment,
  AssignmentResult,
  AssignmentSubmission,
  Notification,
  Session,
  Student,
  StudentLedger,
  StudentMetrics,
  User,
  Role,
  Topic,
} from '../models/index.js';
import bcrypt from 'bcrypt';
import { CustomError } from '../../utils/customError.js';
import { generatePortfolioPDF } from './pdfService.js';
import { queueReview } from './codeReviewService.js';

const studentPopulateOptions = [
  {
    path: 'userId',
    select: 'name email mobileNo profileStatus roleId createdAt updatedAt',
    populate: {
      path: 'roleId',
      select: 'name description',
    },
  },
  {
    path: 'batchId',
    select: 'name startDate endDate status',
  },
  {
    path: 'enrolledCourseIds',
    select: 'name instructorIds',
  },
];

export async function getAllStudents() {
  return Student.find()
    .populate(studentPopulateOptions)
    .sort({ enrollementNo: 1 })
    .lean();
}

export async function getStudentById(studentId) {
  if (!studentId) {
    throw new Error('studentId is required');
  }

  const student = await Student.findOne({ _id: studentId }).populate(studentPopulateOptions).lean();
  if (!student) {
    throw new Error('Student not found');
  }

  return student;
}

const TEST_STUDENT_ID = 'student-001';

function getStudentId(req) {
  return (
    req.user?.studentId ||
    req.user?._id ||
    req.user?.id ||
    req.query?.studentId ||
    TEST_STUDENT_ID
  );
}

function toPositiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

async function findStudentOrThrow(studentId) {
  const student = await Student.findOne({ $or: [{ _id: studentId }, { userId: studentId }] })
    .populate('batchId', 'name')
    .lean();
  if (!student) {
    throw new CustomError('Student not found', 404);
  }
  return student;
}

async function getAssignmentQueryForStudent(student) {
  // Primary: if student has a batchId, find all sessions for this batch
  if (student.batchId) {
    const sessionIds = await Session.find({
      batchId: student.batchId,
    }).distinct('_id');

    if (sessionIds.length) {
      return { sessionId: { $in: sessionIds } };
    }
  }

  // Fallback: enrolled course ids
  if (student.enrolledCourseIds?.length) {
    const sessionIds = await Session.find({
      courseId: { $in: student.enrolledCourseIds },
    }).distinct('_id');

    if (sessionIds.length) {
      return { sessionId: { $in: sessionIds } };
    }
  }

  // Return a query that matches nothing, so we don't accidentally fetch ALL assignments in the DB
  return { _id: null };
}

import { randomUUID } from 'crypto';

export async function createStudent(req) {
  const {
    enrollementNo,
    dob,
    batchId,
    name,
    email,
    mobileNo,
    password,
    profileStatus = 'Active',
    gender,
    educationQualification,
    instituteName,
    gitHubUrl,
    linkedInUrl,
    profilePic,
    resume,
    enrolledCourseIds,
  } = req.body;

  const existingStudent = await Student.findOne({ enrollementNo });
  if (existingStudent) {
    throw new CustomError(`Student with enrollment number ${enrollementNo} already exists`, 409);
  }

  const generatedId = randomUUID();

  const student = await Student.create({
    _id: generatedId,
    userId: generatedId,
    enrollementNo,
    dob,
    batchId,
    gender: gender || '',
    educationQualification: educationQualification || '',
    instituteName: instituteName || '',
    gitHubUrl: gitHubUrl || '',
    linkedInUrl: linkedInUrl || '',
    profilePic: profilePic || '',
    resume: resume || '',
    enrolledCourseIds: enrolledCourseIds || [],
  });

  if (name && email && mobileNo && password) {
    let studentRole = await Role.findOne({ name: 'Student' });
    if (!studentRole) {
      studentRole = await Role.create({
        name: 'Student',
        description: 'Student role',
        permissionIds: [],
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await User.create({
      _id: generatedId,
      name,
      email,
      mobileNo,
      password: hashedPassword,
      roleId: studentRole._id,
      profileStatus,
      tokenVersion: 0,
    });
  }

  return student;
}

export async function getStudentDashboard(req) {
  const studentId = getStudentId(req);
  const student = await findStudentOrThrow(studentId);

  const [user, metrics] = await Promise.all([
    User.findById(student.userId || student._id)
      .select('name email mobileNo profileStatus')
      .lean(),

    StudentMetrics.findOne({ studentId: student._id }).lean(),
  ]);

  const courseFilter = student.batchId
    ? { batchId: student.batchId }
    : (student.enrolledCourseIds?.length
        ? { courseId: { $in: student.enrolledCourseIds } }
        : null);

  const upcomingLectures = courseFilter
    ? await Session.find({
        ...courseFilter,
        sessionDateAndTime: { $gte: new Date() },
        status: { $in: ['scheduled', 'In Progress', 'live'] },
      })
        .select('_id title sessionDateAndTime meetUrl status duration')
        .sort({ sessionDateAndTime: 1 })
        .limit(5)
        .lean()
    : [];

  // Fetch all assignments
  const assignmentQuery = await getAssignmentQueryForStudent(student);

  const allAssignments = await Assignment.find(assignmentQuery)
    .select('_id title submissionDeadline')
    .lean();

  // Fetch student's submissions
  const submissions = await AssignmentSubmission.find({ studentId: student._id })
    .select('assignmentId')
    .lean();

  const submittedAssignmentIds = submissions.map((submission) =>
    submission.assignmentId.toString()
  );

  // Calculate pending assignments dynamically
  const pendingAssignments = allAssignments.filter(
    (assignment) =>
      !submittedAssignmentIds.includes(assignment._id.toString()) &&
      assignment.submissionDeadline >= new Date()
  );

  // Sort pending assignments by deadline (ascending) and limit to 5 for dashboard display
  const displayPendingAssignments = [...pendingAssignments]
    .sort((a, b) => new Date(a.submissionDeadline) - new Date(b.submissionDeadline))
    .slice(0, 5);

  const unreadNotifications = await Notification.countDocuments({
    userId: studentId,
    isRead: false,
  });

  const totalStudentsInBatch = await Student.countDocuments({ batchId: student.batchId?._id || student.batchId });

  return {
    student: {
      id: student._id,
      name: user?.name || '',
      email: user?.email || '',
      enrollementNo: student.enrollementNo,
      batchId: student.batchId?._id || student.batchId,
      batchName: student.batchId?.name || 'Unassigned',
      profilePic: student.profilePic,
    },

    metrics: {
      totalPoints: metrics?.totalPoints ?? student.totalPoints ?? 0,
      rank: metrics?.rank ?? 0,
      percentile: metrics?.percentile ?? 0,
      attendancePercentage: metrics?.attendancePercentage ?? 0,
      assignmentAvgScore: metrics?.assignmentAvgScore ?? 0,
      quizAvgScore: metrics?.quizAvgScore ?? 0,
      totalStudents: totalStudentsInBatch,

      // Dynamic values
      assignmentSubmitted: submissions.length,
      totalAssignments: allAssignments.length,
      pendingAssignments: pendingAssignments.length,
    },

    upcomingLectures: upcomingLectures.map((session) => ({
      id: session._id,
      title: session.title,
      date: session.sessionDateAndTime,
      status: session.status,
      duration: session.duration,
      meetUrl: session.meetUrl,
    })),

    pendingAssignments: displayPendingAssignments.map((assignment) => ({
      id: assignment._id,
      title: assignment.title,
      deadline: assignment.submissionDeadline,
      hoursLeft: Math.max(
        0,
        Math.round(
          ((assignment.submissionDeadline - new Date()) / 3600000) * 10
        ) / 10
      ),
    })),

    unreadNotifications,
  };
}

export async function getMarkHistory(req) {
  const studentId = getStudentId(req);
  await findStudentOrThrow(studentId);

  const page = toPositiveNumber(req.query?.page, 1);
  const limit = toPositiveNumber(req.query?.limit, 10);
  const skip = (page - 1) * limit;

  const filter = { studentId, deletedAt: null };

  const [entries, total] = await Promise.all([
    StudentLedger.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    StudentLedger.countDocuments(filter),
  ]);

  return {
    entries,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  };
}

export async function getStudentProfile(req) {
  const studentId = getStudentId(req);

  const student = await Student.findOne({ $or: [{ _id: studentId }, { userId: studentId }] }).populate('batchId', 'name').lean();
  if (!student) {
    throw new CustomError('Student not found', 404);
  }

  const user = await User.findById(student.userId).select('-password').lean();

  return {
    ...student,
    user: user || null,
  };
}

export async function updateStudentProfile(req) {
  const studentId = getStudentId(req);

  const allowedStudentFields = [
    'educationQualification',
    'gender',
    'profilePic',
    'resume',
    'instituteName',
    'gitHubUrl',
    'linkedInUrl',
    'currentStreak',
    'maxStreak',
    'enrolledCourseIds',
  ];

  const studentUpdate = {};
  for (const field of allowedStudentFields) {
    if (req.body[field] !== undefined) {
      studentUpdate[field] = req.body[field];
    }
  }

  const userUpdate = {};
  for (const field of ['name', 'email', 'mobileNo', 'profileStatus']) {
    if (req.body[field] !== undefined) {
      userUpdate[field] = req.body[field];
    }
  }

  const student = await Student.findOneAndUpdate(
    { $or: [{ _id: studentId }, { userId: studentId }] },
    studentUpdate,
    {
      new: true,
      runValidators: true,
    }
  ).lean();

  if (!student) {
    throw new CustomError('Student not found', 404);
  }

  let user = await User.findById(student.userId).select('-password').lean();
  if (Object.keys(userUpdate).length) {
    user = await User.findByIdAndUpdate(student.userId, userUpdate, {
      new: true,
      runValidators: true,
    })
      .select('-password')
      .lean();
  }

  return { student, user };
}

export async function getStudentAssignments(req) {
  const studentId = getStudentId(req);
  const student = await findStudentOrThrow(studentId);
  const assignmentQuery = await getAssignmentQueryForStudent(student);

  const assignments = await Assignment.find(assignmentQuery)
    .select('_id title prompt task instructions attachments submissionDeadline sessionId createdBy')
    .sort({ submissionDeadline: -1 })
    .lean();

  const assignmentIds = assignments.map((assignment) => assignment._id);
  const submissions = await AssignmentSubmission.find({
    studentId: student._id,
    assignmentId: { $in: assignmentIds },
  }).lean();

  const submissionMap = new Map(submissions.map((submission) => [submission.assignmentId, submission]));

  return assignments.map((assignment) => {
    const submission = submissionMap.get(assignment._id);
    return {
      id: assignment._id,
      title: assignment.title,
      prompt: assignment.prompt,
      task: assignment.task,
      instructions: assignment.instructions,
      attachments: assignment.attachments,
      deadline: assignment.submissionDeadline,
      submitted: Boolean(submission),
      submission: submission
        ? {
          id: submission._id,
          gitSubmissionLink: submission.gitSubmissionLink,
          repoName: submission.repoName,
          branchName: submission.branchName,
          submittedAt: submission.submittedAt,
          onTimeSubmission: submission.onTimeSubmission,
        }
        : null,
    };
  });
}

export async function getAssignmentDetail(req) {
  const studentId = getStudentId(req);
  const { id: assignmentId } = req.params;

  const student = await findStudentOrThrow(studentId);
  const assignment = await Assignment.findById(assignmentId).lean();
  if (!assignment) {
    throw new CustomError('Assignment not found', 404);
  }

  const submission = await AssignmentSubmission.findOne({ assignmentId, studentId: student._id }).lean();
  let result = null;

  if (submission) {
    result = await AssignmentResult.findOne({ submissionId: submission._id }).lean();
  }

  return {
    ...assignment,
    submission: submission || null,
    result: result || null,
  };
}

export async function submitAssignment(req) {
  const studentId = getStudentId(req);
  const { id: assignmentId } = req.params;
  const { gitSubmissionLink, repoName, branchName, remarks } = req.body;

  const student = await findStudentOrThrow(studentId);

  const assignment = await Assignment.findById(assignmentId).lean();
  if (!assignment) {
    throw new CustomError('Assignment not found', 404);
  }

  const existingSubmission = await AssignmentSubmission.findOne({ studentId: student._id, assignmentId }).lean();
  if (existingSubmission) {
    throw new CustomError('Assignment already submitted by this student', 409);
  }

  const submittedAt = new Date();
  const onTimeSubmission = submittedAt <= new Date(assignment.submissionDeadline);

  const submission = await AssignmentSubmission.create({
    studentId: student._id,
    assignmentId,
    gitSubmissionLink,
    repoName: repoName || '',
    branchName: branchName || 'main',
    remarks: remarks || '',
    submittedAt,
    onTimeSubmission,
  });

  queueReview(submission._id).catch(err => console.error('Failed to queue review:', err));

  return {
    submissionId: submission._id,
    assignmentId,
    studentId: student._id,
    gitSubmissionLink: submission.gitSubmissionLink,
    repoName: submission.repoName,
    branchName: submission.branchName,
    remarks: submission.remarks,
    submittedAt: submission.submittedAt,
    onTimeSubmission: submission.onTimeSubmission,
    reviewStatus: 'pending',
  };
}

export async function getAssignmentReview(req) {
  const studentId = getStudentId(req);
  const student = await findStudentOrThrow(studentId);
  const { id: assignmentId } = req.params;

  const submission = await AssignmentSubmission.findOne({ assignmentId, studentId: student._id }).lean();
  if (!submission) {
    throw new CustomError('No submission found for this assignment', 404);
  }

  const result = await AssignmentResult.findOne({ submissionId: submission._id }).lean();

  return {
    submissionId: submission._id,
    assignmentId,
    studentId,
    gitSubmissionLink: submission.gitSubmissionLink,
    submittedAt: submission.submittedAt,
    onTimeSubmission: submission.onTimeSubmission,
    reviewStatus: result ? 'completed' : 'pending',
    result: result
      ? {
        totalMarks: result.totalMarks,
        marksObtained: result.marksObtained,
        percentage: result.percentage,
        points: result.points,
        bonusPoints: result.bonusPoints,
        totalPoints: result.totalPoints,
        feedback: result.feedback,
        codeQualityScore: result.codeQualityScore,
        evalAt: result.evalAt,
        status: result.result,
      }
      : null,
  };
}

export async function getStudentPortfolio(req) {
  const studentId = getStudentId(req);
  const student = await findStudentOrThrow(studentId);

  const [profile, metrics, submissions, ledgerEntries] = await Promise.all([
    getStudentPortfolioProfile(req),
    StudentMetrics.findOne({ studentId: student._id }).lean(),
    AssignmentSubmission.find({ studentId: student._id }).populate('assignmentId', 'title task submissionDeadline').sort({ submittedAt: -1 }).lean(),
    StudentLedger.find({ studentId: student._id, deletedAt: null }).sort({ createdAt: -1 }).limit(10).lean(),
  ]);

  const submissionIds = submissions.map((submission) => submission._id);
  const results = await AssignmentResult.find({ submissionId: { $in: submissionIds } }).lean();
  const resultMap = new Map(results.map((result) => [result.submissionId, result]));

  return {
    profile,
    metrics: metrics || {
      totalPoints: profile.totalPoints || 0,
      attendancePercentage: 0,
      assignmentAvgScore: 0,
      quizAvgScore: 0,
      rank: 0,
      percentile: 0,
    },
    assignments: submissions.map((submission) => {
      const result = resultMap.get(submission._id);
      return {
        submissionId: submission._id,
        assignment: submission.assignmentId,
        gitSubmissionLink: submission.gitSubmissionLink,
        submittedAt: submission.submittedAt,
        onTimeSubmission: submission.onTimeSubmission,
        reviewStatus: result ? 'completed' : 'pending',
        result: result || null,
      };
    }),
    recentLedger: ledgerEntries,
  };
}

// Helper specific to portfolio to avoid recursion
async function getStudentPortfolioProfile(req) {
  const studentId = getStudentId(req);

  const student = await Student.findOne({ $or: [{ _id: studentId }, { userId: studentId }] }).lean();

  if (!student) {
    throw new CustomError('Student not found', 404);
  }

  const user = await User.findById(student.userId).select('-password').lean();

  return {
    ...student,
    user: user || null,
  };
}

export async function downloadPortfolioPDF(req, res) {
  const studentId = getStudentId(req);
  const student = await findStudentOrThrow(studentId);
  return generatePortfolioPDF(studentId, student.batchId, res);
}

export async function getStudentNotifications(req) {
  const studentId = getStudentId(req);
  const page = toPositiveNumber(req.query?.page, 1);
  const limit = toPositiveNumber(req.query?.limit, 10);
  const skip = (page - 1) * limit;

  const [notifications, total] = await Promise.all([
    Notification.find({ userId: studentId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments({ userId: studentId }),
  ]);

  const mappedNotifications = notifications.map((notif) => ({
    ...notif,
    link: notif.meta?.link || null,
  }));

  return {
    notifications: mappedNotifications,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  };
}

export async function markNotificationRead(req) {
  const studentId = getStudentId(req);
  const { id: notificationId } = req.params;

  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, userId: studentId },
    { isRead: true, readAt: new Date(), read: true },
    { new: true, runValidators: true },
  ).lean();

  if (!notification) {
    throw new CustomError('Notification not found', 404);
  }

  return notification;
}

export async function markAllNotificationsRead(req) {
  const studentId = getStudentId(req);

  const result = await Notification.updateMany(
    { userId: studentId, isRead: false },
    { isRead: true, readAt: new Date(), read: true },
  );

  return {
    modifiedCount: result.modifiedCount,
  };
}

export async function getStudentCurriculum(req) {
  const studentId = getStudentId(req);
  const student = await findStudentOrThrow(studentId);
  const batchId = student.batchId;
  if (!batchId) {
    return [];
  }

  const [topics, sessions] = await Promise.all([
    Topic.find({ batchId }).sort({ orderIndex: 1 }).lean(),
    Session.find({ batchId }).lean(),
  ]);

  return topics.map((topic) => {
    const topicSessions = sessions.filter((session) =>
      session.topicIds?.some((id) => id.toString() === topic._id.toString())
    );

    const completed = topicSessions.length > 0 && topicSessions.every((s) => s.status === 'completed');

    return {
      id: topic._id,
      title: topic.title,
      description: topic.description,
      learningObjectives: topic.learningObjectives || [],
      estimatedHours: topic.estimatedHours || 0,
      orderIndex: topic.orderIndex,
      notesFiles: topic.notesFiles || [],
      notesCount: topic.notesFiles?.length || 0,
      lectureCount: topicSessions.length,
      completed,
    };
  });
}
