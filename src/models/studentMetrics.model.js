import mongoose from 'mongoose';
import { schemaOptions, uuidId } from './modelHelpers.js';

const studentMetricsSchema = new mongoose.Schema(
  {
    _id: uuidId,
    studentId: { type: String, ref: 'Student' },
    totalPoints: { type: Number, default: 0 },
    attendancePercentage: { type: Number, default: 0 },
    assignmentAvgScore: { type: Number, default: 0 },
    quizAvgScore: { type: Number, default: 0 },
    rank: { type: Number, default: 0 },
    percentile: { type: Number, default: 0 },
    assignmentSubmitted: { type: Number, default: 0 },
    totalAssignments: { type: Number, default: 0 },
    quizCompleted: { type: Number, default: 0 },
    totalQuiz: { type: Number, default: 0 },
    sessionAttended: { type: Number, default: 0 },
    totalSession: { type: Number, default: 0 },
  },
  schemaOptions,
);

export default mongoose.models.StudentMetrics || mongoose.model('StudentMetrics', studentMetricsSchema);