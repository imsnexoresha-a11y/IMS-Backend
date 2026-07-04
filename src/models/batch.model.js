import mongoose from 'mongoose';
import { schemaOptions, uuidId } from './modelHelpers.js';

const batchSchema = new mongoose.Schema(
  {
    _id: uuidId,
    name: { type: String, required: true, trim: true },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    status: { type: String, enum: ['upcoming', 'ongoing', 'completed'], default: 'upcoming' },
  },
  schemaOptions,
);

export default mongoose.models.Batch || mongoose.model('Batch', batchSchema);