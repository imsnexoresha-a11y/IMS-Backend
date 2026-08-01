import { Student, Batch } from '../models/index.js';
import * as metricsService from './metricsService.js';
import { CustomError } from '../../utils/customError.js';

const studentPopulateForRecruiter = [
  { path: 'userId', select: 'name email profileStatus' },
  { path: 'enrolledCourseIds', select: 'name' },
];

async function getActiveRecruiterBatch(batchUuid) {
  let batch = await Batch.findOne({
    $or: [
      { recruiterUuid: batchUuid },
      { _id: batchUuid.match(/^[0-9a-fA-F]{24}$/) ? batchUuid : null }
    ].filter(Boolean),
    recruiterLinkActive: true,
  })
    .select('_id name description startDate endDate recruiterUuid recruiterLinkActive status')
    .lean();

  if (!batch && batchUuid.match(/^[0-9a-fA-F]{24}$/)) {
    batch = await Batch.findById(batchUuid)
      .select('_id name description startDate endDate recruiterUuid recruiterLinkActive status')
      .lean();
  }

  if (!batch) {
    throw new CustomError('Batch not found or recruiter link inactive', 404);
  }

  return batch;
}

export async function getBatchOverviewService(batchUuid) {
  const batch = await getActiveRecruiterBatch(batchUuid);

  const totalStudents = await Student.countDocuments({ batchId: batch._id });

  const activeStudents = await Student.countDocuments({
    batchId: batch._id,
    status: 'active',
  });

  const completedStudents = totalStudents - activeStudents;

  return {
    batch: {
      id: batch._id,
      name: batch.name,
      description: batch.description || null,
      startDate: batch.startDate || null,
      endDate: batch.endDate || null,
      status: batch.status || null,
      totalStudents,
      activeStudents,
      completedStudents,
    },
  };
}

export async function getBatchStudentsService(batchUuid) {
  const batch = await getActiveRecruiterBatch(batchUuid);

  const students = await Student.find({ batchId: batch._id })
    .populate(studentPopulateForRecruiter)
    .lean();

  const mapped = students.map((student) => ({
    id: student._id,
    name: student.userId?.name || null,
    email: student.userId?.email || null,
    status: student.userId?.profileStatus || student.status || null,
    totalPoints: student.totalPoints || 0,
    course:
      student.enrolledCourseIds?.[0]?.name ||
      null,
  }));

  return {
    batchName: batch.name,
    students: mapped,
    total: mapped.length,
  };
}

export async function getStudentPortfolioService(batchUuid, studentId) {
  const batch = await getActiveRecruiterBatch(batchUuid);

  const student = await Student.findOne({
    _id: studentId,
    batchId: batch._id,
  })
    .populate(studentPopulateForRecruiter)
    .lean();

  if (!student) {
    throw new CustomError('Student not found', 404);
  }

  let attendance = null;
  let overallScore = null;
  let assignmentAvg = 0;
  let quizAvg = 0;

  try {
    attendance = await metricsService.getAttendanceRate(studentId, batch._id);
  } catch {
    attendance = null;
  }

  try {
    overallScore = await metricsService.getTotalScore(studentId);
  } catch {
    overallScore = student.totalPoints || 0;
  }

  try {
    const rawAssignScore = await metricsService.getAssignmentAvgScore(studentId);
    assignmentAvg = Math.round(rawAssignScore <= 10 ? rawAssignScore * 10 : rawAssignScore);
  } catch {
    assignmentAvg = 0;
  }

  try {
    const rawQuizScore = await metricsService.getQuizAvgScore(studentId);
    quizAvg = Math.round(rawQuizScore <= 5 ? (rawQuizScore / 5) * 100 : rawQuizScore);
  } catch {
    quizAvg = 0;
  }

  const course = student.enrolledCourseIds?.[0]?.name || null;

  return {
    batch: {
      id: batch._id,
      name: batch.name,
    },
    student: {
      id: student._id,
      name: student.userId?.name || null,
      email: student.userId?.email || null,
      status: student.userId?.profileStatus || student.status || null,
      attendance,
      overallScore,
      assignmentAvg,
      quizAvg,
      course,
      totalPoints: student.totalPoints || 0,
    },
  };
}