import mongoose from "mongoose";
import { schemaOptions, uuidId } from "./modelHelpers.js";

const instructorSchema = new mongoose.Schema(
  {
    _id: uuidId,
    userId: {
      type: String,
      ref: "User",
      required: true,
      unique: true,
    },

    designation: {
      type: String,
      required: true,
      trim: true,
    },

    specialization: {
      type: String,
      default: "",
      trim: true,
    },

    bio: {
      type: String,
      default: "",
      trim: true,
    },

    assignedBatches: [
      {
        type: String,
        ref: "Batch",
      },
    ],

    profileImage: {
      type: String,
      default: "",
    },

    linkedInUrl: {
      type: String,
      default: "",
      trim: true,
    },

    ratingSum: {
      type: Number,
      default: 0,
    },

    ratingCount: {
      type: Number,
      default: 0,
    },
  },
  {
    ...schemaOptions,
    timestamps: {
      createdAt: "createdAt",
      updatedAt: "updatedAt",
    },
  }
);

export default mongoose.models.Instructor ||
  mongoose.model("Instructor", instructorSchema);
