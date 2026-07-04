import mongoose from 'mongoose';
import { schemaOptions, uuidId } from './modelHelpers.js';

const roleSchema = new mongoose.Schema(
  {
    _id: uuidId,
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    permissionIds: [{ type: String, ref: 'Permission' }],
    deleted_at: { type: Date, default: null },
  },
  {
    ...schemaOptions,
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  },
);

export default mongoose.models.Role || mongoose.model('Role', roleSchema);