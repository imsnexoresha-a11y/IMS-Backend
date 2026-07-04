import mongoose from 'mongoose';
import { schemaOptions, uuidId } from './modelHelpers.js';

const permissionSchema = new mongoose.Schema(
  {
    _id: uuidId,
    method: { type: String, trim: true },
    base_url: { type: String, trim: true },
    path: { type: String, trim: true },
    action_name: { type: String, trim: true },
    description: { type: String, trim: true },
    deleted_at: { type: Date, default: null },
  },
  {
    ...schemaOptions,
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  },
);

export default mongoose.models.Permission || mongoose.model('Permission', permissionSchema);