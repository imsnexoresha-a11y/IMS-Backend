import mongoose from 'mongoose';
import { schemaOptions, uuidId } from './modelHelpers.js';

const instructorSchema = new mongoose.Schema(
  {
    _id: uuidId,
    userId: { type: String, ref: 'User' },
    linkedInUrl: { type: String, trim: true },
    ratingSum: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
  },
  schemaOptions,
);

export default mongoose.models.Instructor || mongoose.model('Instructor', instructorSchema);