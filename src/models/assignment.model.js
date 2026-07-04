import mongoose from 'mongoose';
import { schemaOptions, uuidId } from './modelHelpers.js';

const assignmentSchema = new mongoose.Schema(
  {
    _id: uuidId,
    title: { type: String, trim: true },
    sessionId: { type: String, ref: 'Session' },
    prompt: { type: String, required: true, trim: true },
    submissionDeadline: { type: Date, required: true },
    attachments: { type: String, required: true, trim: true },
    instructions: { type: String, required: true, trim: true },
    task: { type: String, required: true, trim: true },
    createdBy: { type: String, ref: 'User' },
  },
  schemaOptions,
);

export default mongoose.models.Assignment || mongoose.model('Assignment', assignmentSchema);