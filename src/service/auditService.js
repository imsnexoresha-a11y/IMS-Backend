import { AuditLog, Batch, Student, User } from '../models/index.js';
import { CustomError } from '../../utils/customError.js';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function buildFilter({ from, to, adminId, actionType }) {
    const filter = {};

    if (adminId) {
        filter.adminId = adminId;
    }

    if (actionType) {
        filter.actionType = actionType;
    }

    if (from || to) {
        filter.createdAt = {};

        if (from) {
            const fromDate = new Date(from);
            if (Number.isNaN(fromDate.getTime())) {
                throw new CustomError('from must be a valid date', 400);
            }
            filter.createdAt.$gte = fromDate;
        }

        if (to) {
            const toDate = new Date(to);
            if (Number.isNaN(toDate.getTime())) {
                throw new CustomError('to must be a valid date', 400);
            }
            filter.createdAt.$lte = toDate;
        }
    }

    return filter;
}

async function enrichLogs(rawLogs) {
    return Promise.all(rawLogs.map(async (log) => {
        let adminName = 'Admin';
        if (log.adminId) {
            if (typeof log.adminId === 'object' && log.adminId.name) {
                adminName = log.adminId.name;
            } else {
                const u = await User.findById(log.adminId).lean();
                if (u) adminName = u.name;
            }
        }

        let entityName = log.entityId || '—';
        if (log.newValue?.batchName) {
            entityName = log.newValue.batchName;
        } else if (log.oldValue?.batchName) {
            entityName = log.oldValue.batchName;
        } else if (log.newValue?.studentName) {
            entityName = log.newValue.studentName;
        } else if (log.oldValue?.studentName) {
            entityName = log.oldValue.studentName;
        } else if (log.entityType === 'batch' && log.entityId) {
            const b = await Batch.findById(log.entityId).lean();
            if (b) entityName = b.name;
        } else if (log.entityType === 'student' && log.entityId) {
            const s = await Student.findById(log.entityId).lean();
            if (s) {
                const u = await User.findById(s.userId).lean();
                if (u) entityName = u.name;
            }
        }

        return {
            ...log,
            createdAt: log.createdAt || log.timestamp || null,
            adminName,
            entityName,
        };
    }));
}

// GET /api/v1/admin/audit-log
async function getAuditLogs(query) {
    const filter = buildFilter(query);

    const page = Math.max(Number(query.page) || DEFAULT_PAGE, 1);
    const limit = Math.min(Math.max(Number(query.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const skip = (page - 1) * limit;

    const [rawLogs, total] = await Promise.all([
        AuditLog.find(filter)
            .populate('adminId', 'name email')
            .sort({ createdAt: -1, _id: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        AuditLog.countDocuments(filter),
    ]);

    const logs = await enrichLogs(rawLogs);

    return {
        message: 'Audit logs fetched successfully',
        logs,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit) || 1,
        },
    };
}

// GET /api/v1/admin/audit-log/export  (JSON export, no CSV)
async function exportAuditLogs(query) {
    const filter = buildFilter(query);

    const rawLogs = await AuditLog.find(filter)
        .populate('adminId', 'name email')
        .sort({ createdAt: -1, _id: -1 })
        .lean();

    const logs = await enrichLogs(rawLogs);

    return {
        message: 'Audit log export generated successfully',
        exportedAt: new Date().toISOString(),
        count: logs.length,
        logs,
    };
}

// POST /api/v1/admin/audit-log  (manual entry, for admin actions outside the marks flow)
async function createAuditLog({ adminId, actionType, entityType, entityId, oldValue, newValue, reason }) {
    if (!actionType || !entityType || !reason) {
        throw new CustomError('actionType, entityType and reason are required', 400);
    }

    const log = await AuditLog.create({
        adminId: adminId || null,
        actionType,
        entityType,
        entityId: entityId || null,
        oldValue: oldValue ?? null,
        newValue: newValue ?? null,
        reason,
        createdAt: new Date(),
    });

    return {
        message: 'Audit log created successfully',
        log,
    };
}

export default {
    getAuditLogs,
    exportAuditLogs,
    createAuditLog,
};