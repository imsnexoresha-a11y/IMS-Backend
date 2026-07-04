import mongoose from 'mongoose';
import { schemaOptions, uuidId } from './modelHelpers.js';

const assignmentSubmissionSchema = new mongoose.Schema(
  {
    _id: uuidId,
    studentId: { type: String, ref: 'Student' },
    assignmentId: { type: String, ref: 'Assignment' },
    gitSubmissionLink: { type: String, required: true, trim: true },
    repoName: { type: String, trim: true },
    branchName: { type: String, trim: true },
    remarks: { type: String, trim: true },
    submittedAt: { type: Date, default: null },
    onTimeSubmission: { type: Boolean, default: false },
  },
  schemaOptions,
);

export default mongoose.models.AssignmentSubmission || mongoose.model('AssignmentSubmission', assignmentSubmissionSchema);