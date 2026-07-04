import mongoose from 'mongoose';
import { schemaOptions, uuidId } from './modelHelpers.js';

const sessionSchema = new mongoose.Schema(
  {
    _id: uuidId,
    title: { type: String, required: true, trim: true },
    notes: { type: String, trim: true },
    recordingUrl: { type: String, trim: true },
    courseId: { type: String, ref: 'Course' },
    instructorId: { type: String, ref: 'Instructor' },
    meetUrl: { type: String, trim: true },
    sessionDateAndTime: { type: Date, default: null },
    duration: { type: String, trim: true },
    status: {
      type: String,
      enum: ['scheduled', 'live', 'completed', 'cancelled', 'postponed'],
      default: 'scheduled',
    },
    createdBy: { type: String, ref: 'User' },
  },
  schemaOptions,
);

export default mongoose.models.Session || mongoose.model('Session', sessionSchema);