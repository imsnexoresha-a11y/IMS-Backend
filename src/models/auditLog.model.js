import mongoose from 'mongoose';
import { schemaOptions, uuidId } from './modelHelpers.js';

const auditLogSchema = new mongoose.Schema(
    {
        _id: uuidId,

        adminId: {
            type: String,
            ref: 'User',
            default: null,
        },

        actionType: {
            type: String,
            required: true,
            trim: true,
        },

        entityType: {
            type: String,
            required: true,
            trim: true,
        },

        entityId: {
            type: String,
            default: null,
            trim: true,
        },

        oldValue: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },

        newValue: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },

        reason: {
            type: String,
            required: true,
            trim: true,
        },

        createdAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        ...schemaOptions,
        timestamps: true,
    },
);

export default mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);