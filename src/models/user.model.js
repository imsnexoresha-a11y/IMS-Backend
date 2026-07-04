import mongoose from 'mongoose';
import { schemaOptions, uuidId } from './modelHelpers.js';

const userSchema = new mongoose.Schema(
  {
    _id: uuidId,
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    mobileNo: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    password: { type: String, required: true },
    roleId: { type: String, ref: 'Role' },
    created_by: { type: String, ref: 'User', default: null },
    profileStatus: {
      type: String,
      enum: ['Active', 'Inactive', 'blocked'],
      required: true,
    },
    tokenVersion: { type: Number, required: true, default: 0 },
    passwordChangedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  {
    ...schemaOptions,
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

export default mongoose.models.User || mongoose.model('User', userSchema);