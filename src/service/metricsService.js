import {
  Assignment,
  AssignmentResult,
  AssignmentSubmission,
  Attendance,
  Batch,
  BatchConfig,
  Quiz,
  QuizResult,
  Session,
  Student,
  StudentLedger,
} from '../models/index.js';
import * as cacheService from './cacheService.js';
import { CONSTANTS } from '../../utils/constant.js';

function toNumber(value) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function average(values) {
  if (!values.length) {
    return 0;
  }

  const total = values.reduce((sum, value) => sum + toNumber(value), 0);
  return total / values.length;
}

function getAttendanceScore(status) {
  switch (status) {
    case 'present':
      return 1;
    case 'half':
      return 0.4;
    default:
      return 0;
  }
}

function calculateStandardDeviation(values) {
  if (!values.length || values.length < 2) {
    return 0;
  }

  const mean = average(values);
  const variance = average(values.map((value) => (toNumber(value) - mean) ** 2));
  return Math.sqrt(variance);
}

function calculateLinearRegressionSlope(values) {
  if (!values.length || values.length < 2) {
    return 0;
  }

  const n = values.length;
  const meanX = (n - 1) / 2;
  const meanY = average(values);

  let covariance = 0;
  let variance = 0;

  values.forEach((value, index) => {
    const x = index;
    const y = toNumber(value);
    covariance += (x - meanX) * (y - meanY);
    variance += (x - meanX) ** 2;
  });

  if (variance === 0) {
    return 0;
  }

  return covariance / variance;
}

async function resolveStudent(studentId) {
  if (!studentId) {
    return null;
  }

  const selectFields = '_id enrollementNo batchId enrolledCourseIds';

  return Student.findOne({
    $or: [
      { _id: studentId },
      { enrollementNo: studentId },
    ],
  })
    .select(selectFields)
    .lean();
}

async function resolveBatchId(studentId, batchId) {
  if (batchId) {
    return batchId;
  }

  const student = await resolveStudent(studentId);
  return student?.batchId || null;
}

async function getLedgerSum(studentId) {
  if (!studentId) {
    return 0;
  }

  const resolvedStudent = await resolveStudent(studentId);
  if (!resolvedStudent) {
    return 0;
  }

  const ledgerEntries = await StudentLedger.find({ studentId: resolvedStudent._id, deletedAt: null })
    .select('points')
    .lean();

  return ledgerEntries.reduce((sum, entry) => sum + toNumber(entry.points), 0);
}

async function getBatchConfig(batchId) {
  if (!batchId) {
    return null;
  }

  const batchConfig = await BatchConfig.findOne({ batchId }).select('baseScore markCap').lean();
  return batchConfig;
}

// Aggregate each student's ledger points and add the stored base score to build a batch-level total score.
async function getBatchScoreSummary(batchId) {
  if (!batchId) {
    return [];
  }

  const batchExists = await Batch.findById(batchId).select('_id').lean();
  if (!batchExists) {
    return [];
  }

  const [batchConfig, students] = await Promise.all([
    getBatchConfig(batchId),
    Student.find({ batchId }).select('_id').lean(),
  ]);

  if (!students.length) {
    return [];
  }

  const studentIds = students.map((student) => student._id);
  const ledgerTotals = await StudentLedger.aggregate([
    {
      $match: {
        studentId: { $in: studentIds },
        deletedAt: null,
      },
    },
    {
      $group: {
        _id: '$studentId',
        ledgerSum: { $sum: '$points' },
      },
    },
  ]);

  const ledgerMap = new Map(ledgerTotals.map((item) => [item._id, toNumber(item.ledgerSum)]));
  const baseScore = batchConfig?.baseScore || 0;
  const markCap = batchConfig?.markCap ?? CONSTANTS.MARK_CAP;

  return students.map((student) => {
    const totalScore = (ledgerMap.get(student._id) || 0) + baseScore;

    return {
      studentId: student._id,
      totalScore: clamp(totalScore, 0, markCap),
    };
  });
}

// Rank is derived from descending total score, and percentile is the share of students below the target student.
async function getBatchRankAndPercentile(studentId, batchId) {
  if (!studentId) {
    return { rank: 0, percentile: 0 };
  }

  const resolvedStudent = await resolveStudent(studentId);
  if (!resolvedStudent) {
    return { rank: 0, percentile: 0 };
  }

  const resolvedBatchId = await resolveBatchId(studentId, batchId);
  if (!resolvedBatchId) {
    return { rank: 0, percentile: 0 };
  }

  const scoreSummary = await getBatchScoreSummary(resolvedBatchId);
  if (!scoreSummary.length) {
    return { rank: 0, percentile: 0 };
  }

  const sortedScores = [...scoreSummary].sort((left, right) => right.totalScore - left.totalScore);
  const targetEntry = sortedScores.find((entry) => entry.studentId === resolvedStudent._id);

  if (!targetEntry) {
    return { rank: 0, percentile: 0 };
  }

  const belowCount = sortedScores.filter((entry) => entry.totalScore < targetEntry.totalScore).length;
  const percentile = (belowCount / sortedScores.length) * 100;
  const rank = sortedScores.findIndex((entry) => entry.studentId === resolvedStudent._id) + 1;

  return { rank, percentile };
}

async function getCompletedAssignmentResults(studentId) {
  if (!studentId) {
    return [];
  }

  const resolvedStudent = await resolveStudent(studentId);
  if (!resolvedStudent) {
    return [];
  }

  const submissions = await AssignmentSubmission.find({ studentId: resolvedStudent._id }).select('_id').lean();
  if (!submissions.length) {
    return [];
  }

  const submissionIds = submissions.map((submission) => submission._id);
  return AssignmentResult.find({ submissionId: { $in: submissionIds } })
    .select('submissionId codeQualityScore')
    .lean();
}

async function getAttendanceRecords(studentId) {
  if (!studentId) {
    return [];
  }

  const resolvedStudent = await resolveStudent(studentId);
  if (!resolvedStudent) {
    return [];
  }

  return Attendance.find({ studentId: resolvedStudent._id }).sort({ markedAt: 1 }).select('status markedAt').lean();
}

async function getBatchAssignmentReviewScores(batchId) {
  if (!batchId) {
    return [];
  }

  const batchExists = await Batch.findById(batchId).select('_id').lean();
  if (!batchExists) {
    return [];
  }

  const students = await Student.find({ batchId }).select('_id').lean();
  if (!students.length) {
    return [];
  }

  const studentIds = students.map((student) => student._id);
  const submissions = await AssignmentSubmission.find({ studentId: { $in: studentIds } })
    .select('_id')
    .lean();

  if (!submissions.length) {
    return [];
  }

  const submissionIds = submissions.map((submission) => submission._id);
  return AssignmentResult.find({ submissionId: { $in: submissionIds } })
    .select('submissionId codeQualityScore')
    .lean();
}

async function getTotalScore(studentId) {
  if (!studentId) {
    return 0;
  }

  const student = await resolveStudent(studentId);
  if (!student) {
    return 0;
  }

  const batchConfig = await getBatchConfig(student.batchId);
  const baseScore = batchConfig?.baseScore || 0;
  const markCap = batchConfig?.markCap ?? CONSTANTS.MARK_CAP;
  const ledgerSum = await getLedgerSum(studentId);
  const totalScore = ledgerSum + baseScore;
  return clamp(totalScore, 0, markCap);
}

async function getBatchRank(studentId, batchId) {
  const { rank } = await getBatchRankAndPercentile(studentId, batchId);
  return rank;
}

async function getBatchPercentile(studentId, batchId) {
  const { percentile } = await getBatchRankAndPercentile(studentId, batchId);
  return percentile;
}

async function getAssignmentAvgScore(studentId) {
  const results = await getCompletedAssignmentResults(studentId);
  if (!results.length) {
    return 0;
  }

  const scores = results.map((result) => toNumber(result.codeQualityScore));
  return average(scores);
}

async function getQuizAvgScore(studentId) {
  if (!studentId) {
    return 0;
  }

  const student = await resolveStudent(studentId);
  if (!student) {
    return 0;
  }

  const quizResults = await QuizResult.find({ studentId: student._id }).select('marksObtained').lean();
  if (!quizResults.length) {
    return 0;
  }

  const scores = quizResults.map((result) => toNumber(result.marksObtained));
  return average(scores);
}

// Participation is measured from quiz result records because the current schema does not expose a separate missed-event flag.
async function getQuizParticipationRate(studentId, batchId) {
  if (!studentId) {
    return 0;
  }

  const student = await resolveStudent(studentId);
  if (!student) {
    return 0;
  }

  const resolvedBatchId = await resolveBatchId(studentId, batchId);
  if (!resolvedBatchId || student.batchId !== resolvedBatchId) {
    return 0;
  }

  const batchSessionIds = await Session.find({ courseId: { $in: student.enrolledCourseIds }, status: { $ne: 'cancelled' } }).select('_id').lean();
  const quizIds = await Quiz.find({ sessionId: { $in: batchSessionIds.map((session) => session._id) } }).select('_id').lean();
  const scheduledQuizzes = quizIds.length;

  if (!scheduledQuizzes) {
    return 0;
  }

  const participatedQuizzes = await QuizResult.countDocuments({ studentId: student._id, quizId: { $in: quizIds.map((quiz) => quiz._id) } });

  return (participatedQuizzes / scheduledQuizzes) * 100;
}

async function getAttendanceRate(studentId, batchId) {
  if (!studentId) {
    return 0;
  }

  const student = await resolveStudent(studentId);
  if (!student) {
    return 0;
  }

  const resolvedBatchId = await resolveBatchId(studentId, batchId);
  if (!resolvedBatchId || student.batchId !== resolvedBatchId) {
    return 0;
  }

  const records = await getAttendanceRecords(student._id);
  if (!records.length) {
    return 0;
  }

  const fullAttendanceCount = records.filter((record) => record.status === 'present').length;
  return (fullAttendanceCount / records.length) * 100;
}

async function getOnTimeSubmissionRate(studentId, batchId) {
  if (!studentId) {
    return 0;
  }

  const student = await resolveStudent(studentId);
  if (!student) {
    return 0;
  }

  const resolvedBatchId = await resolveBatchId(studentId, batchId);
  if (!resolvedBatchId || student.batchId !== resolvedBatchId) {
    return 0;
  }

  const courseIds = student.enrolledCourseIds || [];
  const sessionIds = await Session.find({ courseId: { $in: courseIds } }).select('_id').lean();
  const assignmentIds = await Assignment.find({ sessionId: { $in: sessionIds.map((session) => session._id) } }).select('_id').lean();
  const totalPublishedAssignments = assignmentIds.length;

  if (!totalPublishedAssignments) {
    return 0;
  }

  const onTimeSubmissions = await AssignmentSubmission.countDocuments({
    studentId: student._id,
    assignmentId: { $in: assignmentIds.map((assignment) => assignment._id) },
    onTimeSubmission: true,
  });

  return (onTimeSubmissions / totalPublishedAssignments) * 100;
}

async function getPunctualityIndex(studentId, batchId) {
  if (!studentId) {
    return 0;
  }

  const student = await resolveStudent(studentId);
  if (!student) {
    return 0;
  }

  const resolvedBatchId = await resolveBatchId(studentId, batchId);
  if (resolvedBatchId && student.batchId !== resolvedBatchId) {
    return 0;
  }

  const records = await getAttendanceRecords(student._id);
  if (!records.length) {
    return 0;
  }

  const punctualityScores = records.map((record) => getAttendanceScore(record.status));
  return average(punctualityScores) * 100;
}

// Lead time is the positive number of hours between a submission and the assignment deadline for on-time submissions.
async function getSubmissionLeadTime(studentId) {
  if (!studentId) {
    return 0;
  }

  const student = await resolveStudent(studentId);
  if (!student) {
    return 0;
  }

  const submissions = await AssignmentSubmission.find({
    studentId: student._id,
    onTimeSubmission: true,
    submittedAt: { $ne: null },
  })
    .select('_id assignmentId submittedAt')
    .lean();

  if (!submissions.length) {
    return 0;
  }

  const assignmentIds = [...new Set(submissions.map((submission) => submission.assignmentId))];
  const assignments = await Assignment.find({ _id: { $in: assignmentIds } }).select('_id submissionDeadline').lean();
  const deadlineMap = new Map(assignments.map((assignment) => [assignment._id, assignment.submissionDeadline]));

  const leadTimes = submissions
    .map((submission) => {
      const deadline = deadlineMap.get(submission.assignmentId);
      const submittedAt = submission.submittedAt;

      if (!deadline || !submittedAt) {
        return null;
      }

      const differenceInHours = (new Date(deadline).getTime() - new Date(submittedAt).getTime()) / 3600000;
      return differenceInHours > 0 ? differenceInHours : 0;
    })
    .filter((value) => value !== null);

  if (!leadTimes.length) {
    return 0;
  }

  return average(leadTimes);
}

async function getZeroMissStreaks(studentId, batchId) {
  if (!studentId) {
    return 0;
  }

  const student = await resolveStudent(studentId);
  if (!student) {
    return 0;
  }

  const resolvedBatchId = await resolveBatchId(studentId, batchId);
  if (resolvedBatchId && student.batchId !== resolvedBatchId) {
    return 0;
  }

  const records = await getAttendanceRecords(student._id);
  let longestStreak = 0;
  let currentStreak = 0;

  records.forEach((record) => {
    if (record.status === 'present') {
      currentStreak += 1;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  });

  return longestStreak;
}

async function getCodeQualityAvg(studentId) {
  return getAssignmentAvgScore(studentId);
}

async function getCodeImprovementRate(studentId) {
  if (!studentId) {
    return 0;
  }

  const student = await resolveStudent(studentId);
  if (!student) {
    return 0;
  }

  const submissions = await AssignmentSubmission.find({ studentId: student._id, submittedAt: { $ne: null } })
    .sort({ submittedAt: 1 })
    .select('_id submittedAt')
    .lean();

  if (!submissions.length) {
    return 0;
  }

  const submissionIds = submissions.map((submission) => submission._id);
  const results = await AssignmentResult.find({ submissionId: { $in: submissionIds } })
    .select('submissionId codeQualityScore')
    .lean();

  const resultMap = new Map(results.map((result) => [result.submissionId, toNumber(result.codeQualityScore)]));
  const scoreSeries = submissions
    .map((submission) => resultMap.get(submission._id))
    .filter((value) => value !== undefined);

  if (scoreSeries.length < 2) {
    return 0;
  }

  return calculateLinearRegressionSlope(scoreSeries);
}

async function getPerfectAssignmentCount(studentId) {
  const results = await getCompletedAssignmentResults(studentId);
  return results.filter((result) => toNumber(result.codeQualityScore) === 10).length;
}

async function getBelowAvgAssignmentRate(studentId, batchId) {
  if (!studentId) {
    return 0;
  }

  const resolvedBatchId = await resolveBatchId(studentId, batchId);
  if (!resolvedBatchId) {
    return 0;
  }

  const [studentResults, batchResults] = await Promise.all([
    getCompletedAssignmentResults(studentId),
    getBatchAssignmentReviewScores(resolvedBatchId),
  ]);

  if (!studentResults.length || !batchResults.length) {
    return 0;
  }

  const batchAverage = average(batchResults.map((result) => toNumber(result.codeQualityScore)));
  if (!Number.isFinite(batchAverage) || batchAverage === 0) {
    return 0;
  }

  const belowAverageCount = studentResults.filter(
    (result) => toNumber(result.codeQualityScore) < batchAverage,
  ).length;

  return (belowAverageCount / studentResults.length) * 100;
}

// Consistency is penalized by the spread of lecture-level attendance scores and clamped to the 0-100 range.
async function getConsistencyScore(studentId) {
  if (!studentId) {
    return 0;
  }

  const records = await getAttendanceRecords(studentId);
  if (!records.length) {
    return 0;
  }

  const lectureScores = records.map((record) => getAttendanceScore(record.status));
  return clamp(100 - calculateStandardDeviation(lectureScores) * 10, 0, 100);
}

async function getGrowthRate(studentId, batchId) {
  if (!studentId) {
    return 0;
  }

  const student = await resolveStudent(studentId);
  if (!student) {
    return 0;
  }

  const resolvedBatchId = await resolveBatchId(studentId, batchId);
  if (resolvedBatchId && student.batchId !== resolvedBatchId) {
    return 0;
  }

  const records = await getAttendanceRecords(student._id);
  if (records.length < 2) {
    return 0;
  }

  const values = records.map((record) => getAttendanceScore(record.status));
  const windowSize = Math.max(1, Math.ceil(values.length * 0.3));
  const firstWindow = values.slice(0, windowSize);
  const lastWindow = values.slice(-windowSize);

  return average(lastWindow) - average(firstWindow);
}

async function getEngagementScore(studentId, batchId) {
  const [quizParticipationRate, onTimeSubmissionRate, attendanceRate] = await Promise.all([
    getQuizParticipationRate(studentId, batchId),
    getOnTimeSubmissionRate(studentId, batchId),
    getAttendanceRate(studentId, batchId),
  ]);

  return clamp(quizParticipationRate * 0.3 + onTimeSubmissionRate * 0.4 + attendanceRate * 0.3, 0, 100);
}

async function getAllMetrics(studentId, batchId) {
  if (!studentId) {
    return {};
  }

  const resolvedBatchId = await resolveBatchId(studentId, batchId);
  if (!resolvedBatchId) {
    return {};
  }

  const resolvedStudent = await resolveStudent(studentId);
  if (!resolvedStudent) {
    return {};
  }

  const cachedMetrics = await cacheService.getStudentMetricsCache(resolvedBatchId, resolvedStudent._id);
  if (cachedMetrics) {
    return cachedMetrics;
  }

  const [
    totalScore,
    batchRank,
    batchPercentile,
    assignmentAvgScore,
    quizAvgScore,
    quizParticipationRate,
    attendanceRate,
    onTimeSubmissionRate,
    punctualityIndex,
    submissionLeadTime,
    zeroMissStreaks,
    codeQualityAvg,
    codeImprovementRate,
    perfectAssignmentCount,
    belowAvgAssignmentRate,
    consistencyScore,
    growthRate,
    engagementScore,
  ] = await Promise.all([
    getTotalScore(studentId),
    getBatchRank(studentId, batchId),
    getBatchPercentile(studentId, batchId),
    getAssignmentAvgScore(studentId),
    getQuizAvgScore(studentId),
    getQuizParticipationRate(studentId, batchId),
    getAttendanceRate(studentId, batchId),
    getOnTimeSubmissionRate(studentId, batchId),
    getPunctualityIndex(studentId, batchId),
    getSubmissionLeadTime(studentId),
    getZeroMissStreaks(studentId, batchId),
    getCodeQualityAvg(studentId),
    getCodeImprovementRate(studentId),
    getPerfectAssignmentCount(studentId),
    getBelowAvgAssignmentRate(studentId, batchId),
    getConsistencyScore(studentId),
    getGrowthRate(studentId, batchId),
    getEngagementScore(studentId, batchId),
  ]);

  const metrics = {
    totalScore,
    batchRank,
    batchPercentile,
    assignmentAvgScore,
    quizAvgScore,
    quizParticipationRate,
    attendanceRate,
    onTimeSubmissionRate,
    punctualityIndex,
    submissionLeadTime,
    zeroMissStreaks,
    codeQualityAvg,
    codeImprovementRate,
    perfectAssignmentCount,
    belowAvgAssignmentRate,
    consistencyScore,
    growthRate,
    engagementScore,
  };

  await cacheService.setStudentMetricsCache(resolvedBatchId, resolvedStudent._id, metrics);
  return metrics;
}
async function getBatchMetrics(batchId) {
  const emptyDistribution = [
    {
      range: 'Below 80',
      students: 0,
    },
    {
      range: '80–99',
      students: 0,
    },
    {
      range: '100–119',
      students: 0,
    },
    {
      range: '120–139',
      students: 0,
    },
    {
      range: '140+',
      students: 0,
    },
  ];

  const emptyMetrics = {
    studentCount: 0,
    avgOverallScore: 0,
    avgAttendance: 0,
    avgQuizScore: 0,
    avgAssignmentScore: 0,
    scoreDistribution: emptyDistribution,
  };

  if (!batchId) {
    return emptyMetrics;
  }

  const batch = await Batch.findById(batchId)
    .select('_id studentIds')
    .lean();

  if (!batch) {
    return emptyMetrics;
  }

  const batchStudentIds = Array.isArray(
    batch.studentIds
  )
    ? batch.studentIds
    : [];

  const membershipConditions = [
    {
      batchId,
    },
  ];

  if (batchStudentIds.length > 0) {
    membershipConditions.push({
      _id: {
        $in: batchStudentIds,
      },
    });
  }

  const students = await Student.find({
    $or: membershipConditions,
  })
    .select('_id')
    .lean();

  if (students.length === 0) {
    return emptyMetrics;
  }

  const batchConfig = await getBatchConfig(batchId);

  const baseScore = toNumber(
    batchConfig?.baseScore
  );

  const markCap =
    batchConfig?.markCap ??
    CONSTANTS.MARK_CAP;

  const studentMetrics = await Promise.all(
    students.map(async (student) => {
      const studentId =
        student._id.toString();

      const [
        ledgerSum,
        attendanceRecords,
        quizAvgScore,
        assignmentAvgScore,
      ] = await Promise.all([
        getLedgerSum(studentId),
        getAttendanceRecords(studentId),
        getQuizAvgScore(studentId),
        getAssignmentAvgScore(studentId),
      ]);

      const presentCount =
        attendanceRecords.filter(
          (record) =>
            record.status === 'present'
        ).length;

      const attendanceRate =
        attendanceRecords.length > 0
          ? (
            presentCount /
            attendanceRecords.length
          ) * 100
          : 0;

      const totalScore = clamp(
        ledgerSum + baseScore,
        0,
        markCap
      );

      return {
        totalScore,
        attendanceRate,
        quizAvgScore,
        assignmentAvgScore,
      };
    })
  );

  const totalScores = studentMetrics.map(
    (metrics) =>
      toNumber(metrics.totalScore)
  );

  const attendanceScores =
    studentMetrics.map((metrics) =>
      toNumber(metrics.attendanceRate)
    );

  const quizScores = studentMetrics.map(
    (metrics) =>
      toNumber(metrics.quizAvgScore)
  );

  const assignmentScores =
    studentMetrics.map((metrics) =>
      toNumber(
        metrics.assignmentAvgScore
      )
    );

  const scoreDistribution = [
    {
      range: 'Below 80',
      students: totalScores.filter(
        (score) => score < 80
      ).length,
    },
    {
      range: '80–99',
      students: totalScores.filter(
        (score) =>
          score >= 80 &&
          score < 100
      ).length,
    },
    {
      range: '100–119',
      students: totalScores.filter(
        (score) =>
          score >= 100 &&
          score < 120
      ).length,
    },
    {
      range: '120–139',
      students: totalScores.filter(
        (score) =>
          score >= 120 &&
          score < 140
      ).length,
    },
    {
      range: '140+',
      students: totalScores.filter(
        (score) => score >= 140
      ).length,
    },
  ];

  return {
    studentCount: students.length,

    avgOverallScore: Number(
      average(totalScores).toFixed(2)
    ),

    avgAttendance: Number(
      average(
        attendanceScores
      ).toFixed(2)
    ),

    avgQuizScore: Number(
      average(quizScores).toFixed(2)
    ),

    avgAssignmentScore: Number(
      average(
        assignmentScores
      ).toFixed(2)
    ),

    scoreDistribution,
  };
}
const metricsService = {
  getBatchMetrics,
  getTotalScore,
  getBatchRank,
  getBatchPercentile,
  getAssignmentAvgScore,
  getQuizAvgScore,
  getQuizParticipationRate,
  getAttendanceRate,
  getOnTimeSubmissionRate,
  getPunctualityIndex,
  getSubmissionLeadTime,
  getZeroMissStreaks,
  getCodeQualityAvg,
  getCodeImprovementRate,
  getPerfectAssignmentCount,
  getBelowAvgAssignmentRate,
  getConsistencyScore,
  getGrowthRate,
  getEngagementScore,
  getAllMetrics,
};

export {
  getBatchMetrics,
  getTotalScore,
  getBatchRank,
  getBatchPercentile,
  getAssignmentAvgScore,
  getQuizAvgScore,
  getQuizParticipationRate,
  getAttendanceRate,
  getOnTimeSubmissionRate,
  getPunctualityIndex,
  getSubmissionLeadTime,
  getZeroMissStreaks,
  getCodeQualityAvg,
  getCodeImprovementRate,
  getPerfectAssignmentCount,
  getBelowAvgAssignmentRate,
  getConsistencyScore,
  getGrowthRate,
  getEngagementScore,
  getAllMetrics,
};

if (typeof module !== 'undefined') {
  module.exports = metricsService;
}

export default metricsService;