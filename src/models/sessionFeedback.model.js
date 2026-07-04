import mongoose from 'mongoose';
import { schemaOptions, uuidId } from './modelHelpers.js';

const sessionFeedbackSchema = new mongoose.Schema(
  {
    _id: uuidId,
    studentId: { type: String, ref: 'Student' },
    feedbackType: { type: String, enum: ['session', 'instructor'], required: true },
    feedbackTypeId: { type: String, default: null },
    avgRating: { type: Number, required: true },
    feedback: { type: String, required: true, trim: true },
    parameters: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  schemaOptions,
);

export default mongoose.models.SessionFeedback || mongoose.model('SessionFeedback', sessionFeedbackSchema);