import mongoose from 'mongoose';
import { schemaOptions, uuidId } from './modelHelpers.js';

const assignmentResultSchema = new mongoose.Schema(
  {
    _id: uuidId,
    submissionId: { type: String, ref: 'AssignmentSubmission' },
    parameters: { type: mongoose.Schema.Types.Mixed, default: {} },
    totalMarks: { type: Number, default: 0 },
    marksObtained: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    points: { type: Number, default: 0 },
    bonusPoints: { type: Number, default: 0 },
    totalPoints: { type: Number, default: 0 },
    feedback: { type: String, trim: true },
    codeQualityScore: { type: Number, default: 0 },
    evalBy: { type: String, ref: 'Instructor' },
    evalAt: { type: Date, default: null },
    result: { type: String, enum: ['pass', 'failed'], default: 'failed' },
  },
  schemaOptions,
);

export default mongoose.models.AssignmentResult || mongoose.model('AssignmentResult', assignmentResultSchema);