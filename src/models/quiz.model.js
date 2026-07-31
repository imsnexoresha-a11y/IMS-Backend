import mongoose from "mongoose";
import { schemaOptions, uuidId } from "./modelHelpers.js";

const quizSchema = new mongoose.Schema(
  {
    _id: uuidId,

    title: {
      type: String,
      required: true,
      trim: true,
    },

    batchId: {
      type: String,
      ref: "Batch",
      default: "",
    },

    sessionId: {
      type: String,
      ref: "Session",
      default: "",
    },

    link: {
      type: String,
      trim: true,
      default: "",
    },

    submissionDeadline: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 86400000),
    },

    totalMarks: {
      type: Number,
      default: 100,
    },

    passingMarks: {
      type: Number,
      default: 40,
    },

    totaldurationInMins: {
      type: Number,
      default: 30,
    },

    createdBy: {
      type: String,
      ref: "User",
    },
  },
  schemaOptions
);

// One quiz per session
quizSchema.index(
  { sessionId: 1 },
  { unique: true }
);

// For batch-wise queries
quizSchema.index({
  batchId: 1,
});

export default mongoose.models.Quiz ||
  mongoose.model("Quiz", quizSchema);