import mongoose from 'mongoose';
import { schemaOptions, uuidId } from './modelHelpers.js';

const quizSchema = new mongoose.Schema(
  {
    _id: uuidId,
    title: { type: String, trim: true },
    sessionId: { type: String, ref: 'Session' },
    link: { type: String, trim: true },
    submissionDeadline: { type: Date, required: true },
    totalMarks: { type: String, trim: true },
    passingMarks: { type: String, trim: true },
    totaldurationInMins: { type: Number, default: 0 },
    createdBy: { type: String, ref: 'User' },
  },
  schemaOptions,
);

export default mongoose.models.Quiz || mongoose.model('Quiz', quizSchema);