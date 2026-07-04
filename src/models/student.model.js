import mongoose from 'mongoose';
import { schemaOptions, uuidId } from './modelHelpers.js';

const studentSchema = new mongoose.Schema(
  {
    _id: uuidId,
    enrollementNo: { type: String, required: true, unique: true, trim: true },
    userId: { type: String, ref: 'User' },
    educationQualification: { type: String, trim: true },
    dob: { type: Date, required: true },
    gender: { type: String, trim: true },
    profilePic: { type: String, trim: true },
    resume: { type: String, trim: true },
    instituteName: { type: String, trim: true },
    batchId: { type: String, ref: 'Batch' },
    currentStreak: { type: Number, default: 0 },
    maxStreak: { type: Number, default: 0 },
    totalPoints: { type: Number, default: 0 },
    gitHubUrl: { type: String, trim: true },
    linkedInUrl: { type: String, trim: true },
    enrolledCourseIds: [{ type: String, ref: 'Course' }],
  },
  schemaOptions,
);

export default mongoose.models.Student || mongoose.model('Student', studentSchema);