import mongoose from 'mongoose';
import { schemaOptions, uuidId } from './modelHelpers.js';

const quizResultSchema = new mongoose.Schema(
  {
    _id: uuidId,
    studentId: { type: String, ref: 'Student' },
    quizId: { type: String, ref: 'Quiz' },
    totalMarks: { type: Number, default: 0 },
    marksObtained: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    points: { type: Number, default: 0 },
    bonusPoints: { type: Number, default: 0 },
    totalPoints: { type: Number, default: 0 },
    timeTakenInMins: { type: Number, default: 0 },
    submittedAt: { type: Date, default: null },
    feedback: { type: String, trim: true },
    result: { type: String, enum: ['pass', 'failed'], default: 'failed' },
  },
  schemaOptions,
);

export default mongoose.models.QuizResult || mongoose.model('QuizResult', quizResultSchema);