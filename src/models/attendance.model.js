import mongoose from 'mongoose';
import { schemaOptions, uuidId } from './modelHelpers.js';

const attendanceSchema = new mongoose.Schema(
  {
    _id: uuidId,
    studentId: { type: String, ref: 'Student' },
    courseId: { type: String, ref: 'Course' },
    sessionId: { type: String, ref: 'Session' },
    status: { type: String, enum: ['present', 'absent', 'leave', 'half'], required: true },
    markedBy: { type: String, ref: 'User' },
    markedAt: { type: Date, default: null },
  },
  schemaOptions,
);

export default mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);