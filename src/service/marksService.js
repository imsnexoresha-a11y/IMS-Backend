import {
  Student,
  Batch,
  BatchConfig,
  StudentLedger,
  StudentMetrics,
  AuditLog,
  AssignmentSubmission,
} from '../models/index.js';
import { CustomError } from '../../utils/customError.js';
import * as cacheService from './cacheService.js';
import enums from '../../utils/enums.js';

const { LEDGER_EVENT, AUDIT_ACTION, AUDIT_TARGET } = enums;

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function assertReason(reason) {
  if (!reason || reason.trim().length < 20) {
    throw new CustomError('Reason must be at least 20 characters', 400);
  }
}

async function resolveStudentOrThrow(studentId) {
  const student = await Student.findOne({ _id: studentId })
    .select('_id batchId totalPoints baseScore');

  if (!student) {
    throw new CustomError('Student not found', 404);
  }

  return student;
}

async function resolveBatchOrThrow(batchId) {
  const batch = await Batch.findOne({ _id: batchId }).select('_id');

  if (!batch) {
    throw new CustomError('Batch not found', 404);
  }

  return batch;
}

async function resolveBatchConfig(batchId) {
  let config = await BatchConfig.findOne({ batchId });

  if (!config) {
    config = await BatchConfig.create({ batchId });
  }

  return config;
}

async function calculateTotal(studentId, batchId) {
  const config = await resolveBatchConfig(batchId);

  const entries = await StudentLedger.find({
    studentId,
    batchId,
    deletedAt: null,
  }).sort({ createdAt: 1 });

  let rawTotal = toNumber(config.baseScore);

  for (const entry of entries) {
    rawTotal += toNumber(entry.points);
  }

  const markCap = toNumber(config.markCap);
  const cappedTotal = Math.min(rawTotal, markCap);
  const excessPoints = Math.max(rawTotal - markCap, 0);

  return {
    rawTotal,
    cappedTotal,
    excessPoints,
    config,
  };
}

async function updateStudentAndMetrics(studentId, batchId, totalPoints) {
  await Student.findOneAndUpdate(
    { _id: studentId },
    { totalPoints },
  );

  await StudentMetrics.findOneAndUpdate(
    { studentId },
    { studentId, batchId, totalPoints },
    { new: true, upsert: true },
  );
}

async function writeAudit({
  adminId,
  actionType,
  entityType,
  entityId,
  oldValue,
  newValue,
  reason,
}) {
  return AuditLog.create({
    adminId: adminId || null,
    actionType,
    entityType,
    entityId: entityId || null,
    oldValue: oldValue ?? null,
    newValue: newValue ?? null,
    reason,
    createdAt: new Date(),
  });
}

async function applyMarkEvent({
  studentId,
  batchId,
  sourceType,
  sourceId = null,
  points,
  description = '',
  meta = {},
  createdBy = null,

  eventType,
  lectureId,
  marksApplied,
}) {
  const student = await resolveStudentOrThrow(studentId);
  const finalBatchId = batchId || student.batchId;

  if (!finalBatchId) {
    throw new CustomError('batchId is required', 400);
  }

  await resolveBatchOrThrow(finalBatchId);
  await resolveBatchConfig(finalBatchId);

  const finalSourceType = sourceType || eventType;
  const finalSourceId = sourceId || lectureId || null;
  const finalPoints = points !== undefined ? points : marksApplied;

  if (!finalSourceType) {
    throw new CustomError('sourceType/eventType is required', 400);
  }

  if (finalPoints === undefined || Number.isNaN(Number(finalPoints))) {
    throw new CustomError('points/marksApplied must be numeric', 400);
  }

  const ledgerEntry = await StudentLedger.create({
    studentId,
    batchId: finalBatchId,
    sourceType: finalSourceType,
    sourceId: finalSourceId,
    points: Number(finalPoints),
    description,
    meta,
    createdBy,
  });

  const { cappedTotal, excessPoints } = await calculateTotal(
    studentId,
    finalBatchId,
  );

  ledgerEntry.runningTotal = cappedTotal;
  ledgerEntry.excessPoints = excessPoints;
  await ledgerEntry.save();

  await updateStudentAndMetrics(studentId, finalBatchId, cappedTotal);
  await cacheService.invalidateBatchCache(finalBatchId);

  return {
    message: 'Mark event applied successfully',
    ledgerEntry,
    totalPoints: cappedTotal,
    excessPoints,
  };
}

async function reverseAndCorrect({
  studentId,
  ledgerEventId,
  newMark,
  reason,
  auditId = null,
  adminId = null,
}) {
  assertReason(reason);

  const original = await StudentLedger.findOne({
    _id: ledgerEventId,
    deletedAt: null,
  });

  if (!original) {
    throw new CustomError('Ledger event not found', 404);
  }

  const alreadyReversed = await StudentLedger.findOne({
    reversalOf: ledgerEventId,
    isReversal: true,
    deletedAt: null,
  });

  if (alreadyReversed) {
    throw new CustomError('This ledger event has already been corrected', 409);
  }

  const finalStudentId = studentId || original.studentId;
  const oldTotal = await calculateTotal(finalStudentId, original.batchId);

  const reversalEntry = await StudentLedger.create({
    studentId: finalStudentId,
    batchId: original.batchId,
    sourceType: LEDGER_EVENT.REVERSAL,
    sourceId: original._id,
    points: -toNumber(original.points),
    description: `Reversal of ${original._id}: ${reason}`,
    meta: { auditId },
    isReversal: true,
    reversalOf: original._id,
    createdBy: adminId,
  });

  const correctedEntry = await StudentLedger.create({
    studentId: finalStudentId,
    batchId: original.batchId,
    sourceType: original.sourceType,
    sourceId: original.sourceId,
    points: Number(newMark),
    description: `Correction of ${original._id}: ${reason}`,
    meta: { auditId },
    reversalOf: original._id,
    createdBy: adminId,
  });

  const newTotal = await calculateTotal(finalStudentId, original.batchId);

  correctedEntry.runningTotal = newTotal.cappedTotal;
  correctedEntry.excessPoints = newTotal.excessPoints;
  await correctedEntry.save();

  await updateStudentAndMetrics(
    finalStudentId,
    original.batchId,
    newTotal.cappedTotal,
  );

  await writeAudit({
    adminId,
    actionType: AUDIT_ACTION.EVENT_CORRECTION,
    entityType: AUDIT_TARGET.STUDENT,
    entityId: finalStudentId,
    oldValue: { totalScore: oldTotal.cappedTotal, original },
    newValue: {
      totalScore: newTotal.cappedTotal,
      reversalEntry,
      correctedEntry,
    },
    reason,
  });

  await cacheService.invalidateBatchCache(original.batchId);

  return {
    message: 'Ledger event corrected successfully',
    reversalEntry,
    correctedEntry,
    oldTotal: oldTotal.cappedTotal,
    newTotal: newTotal.cappedTotal,
  };
}

async function overrideMarks({ studentId, delta, marks, reason }, adminId) {
  assertReason(reason);

  const points = delta !== undefined ? delta : marks;

  if (points === undefined || Number.isNaN(Number(points))) {
    throw new CustomError('delta/marks must be numeric', 400);
  }

  const student = await resolveStudentOrThrow(studentId);
  const oldTotalData = await calculateTotal(studentId, student.batchId);

  const result = await applyMarkEvent({
    studentId,
    batchId: student.batchId,
    sourceType: LEDGER_EVENT.ADMIN_OVERRIDE,
    sourceId: null,
    points: Number(points),
    description: reason,
    createdBy: adminId,
  });

  await writeAudit({
    adminId,
    actionType: AUDIT_ACTION.MARK_OVERRIDE,
    entityType: AUDIT_TARGET.STUDENT,
    entityId: studentId,
    oldValue: { totalScore: oldTotalData.cappedTotal },
    newValue: {
      totalScore: result.totalPoints,
      ledgerEntryId: result.ledgerEntry._id,
    },
    reason,
  });

  // Notify the specific student about their updated score
  try {
    const { Notification } = await import('../models/index.js');
    const studentDoc = await Student.findById(studentId).populate('userId');
    if (studentDoc?.userId?._id) {
      await Notification.create({
        userId: studentDoc.userId._id,
        type: 'marks_override',
        message: `📊 Your total score has been adjusted to ${result.totalPoints} pts by an admin. Reason: ${reason.slice(0, 60)}${reason.length > 60 ? '...' : ''}`,
        meta: { studentId, newTotal: result.totalPoints },
      });
    }
  } catch (notifErr) {
    console.error('[MarksService] Failed to notify student of mark override:', notifErr);
  }


  return {
    message: 'Marks overridden successfully',
    ledgerEntry: result.ledgerEntry,
    oldTotal: oldTotalData.cappedTotal,
    newTotal: result.totalPoints,
  };
}

async function correctLedgerEvent({ studentId, ledgerEventId, newMark, newMarks, reason }, adminId) {
  const correctedMark = newMark !== undefined ? newMark : newMarks;

  if (correctedMark === undefined || Number.isNaN(Number(correctedMark))) {
    throw new CustomError('newMark/newMarks must be numeric', 400);
  }

  return reverseAndCorrect({
    studentId,
    ledgerEventId,
    newMark: correctedMark,
    reason,
    adminId,
  });
}

async function manualScore({ studentId, submissionId, manualScore, marks, reason }, adminId) {
  assertReason(reason);

  const points = manualScore !== undefined ? manualScore : marks;

  if (points === undefined || Number.isNaN(Number(points))) {
    throw new CustomError('manualScore/marks must be numeric', 400);
  }

  if (Number(points) < 0 || Number(points) > 10) {
    throw new CustomError('Manual score must be between 0 and 10', 400);
  }

  const student = await resolveStudentOrThrow(studentId);

  const submission = await AssignmentSubmission.findById(submissionId);
  if (!submission) {
    throw new CustomError('Submission not found', 404);
  }

  if (String(submission.studentId) !== String(studentId)) {
    throw new CustomError('Submission does not belong to the selected student', 400);
  }

  const result = await applyMarkEvent({
    studentId,
    batchId: student.batchId,
    sourceType: LEDGER_EVENT.ASSIGNMENT,
    sourceId: submissionId || null,
    points: Number(points),
    description: `Manual score: ${reason}`,
    createdBy: adminId,
  });

  await writeAudit({
    adminId,
    actionType: AUDIT_ACTION.MANUAL_SCORE,
    entityType: AUDIT_TARGET.SUBMISSION,
    entityId: submissionId || studentId,
    oldValue: null,
    newValue: { ledgerEntry: result.ledgerEntry },
    reason,
  });

  return {
    message: 'Manual score recorded successfully',
    ledgerEntry: result.ledgerEntry,
  };
}

async function recalculateStudent(studentId, reason, adminId) {
  assertReason(reason);

  const student = await resolveStudentOrThrow(studentId);

  const { cappedTotal, excessPoints } = await calculateTotal(
    studentId,
    student.batchId,
  );

  await updateStudentAndMetrics(
    studentId,
    student.batchId,
    cappedTotal,
  );

  await writeAudit({
    adminId,
    actionType: AUDIT_ACTION.RECALC_TRIGGER,
    entityType: AUDIT_TARGET.STUDENT,
    entityId: studentId,
    oldValue: null,
    newValue: { totalScore: cappedTotal, excessPoints },
    reason,
  });

  await cacheService.invalidateBatchCache(student.batchId);

  return {
    message: 'Student recalculated successfully',
    studentId,
    totalScore: cappedTotal,
    excessPoints,
  };
}

async function recalculateBatch(batchId, reason, adminId) {
  assertReason(reason);

  await resolveBatchOrThrow(batchId);

  const students = await Student.find({ batchId }).select('_id').lean();
  const results = [];

  for (const student of students) {
    const recalculated = await recalculateStudent(student._id, reason, adminId);

    results.push({
      studentId: student._id,
      totalScore: recalculated.totalScore,
    });
  }

  await cacheService.invalidateBatchCache(batchId);

  return {
    message: 'Batch recalculated successfully',
    batchId,
    results,
  };
}

async function getStudentLedgerEvents(studentId) {
  const { StudentLedger } = await import('../models/index.js');
  const entries = await StudentLedger.find({ studentId, deletedAt: null })
    .sort({ createdAt: -1 })
    .lean();
  return entries;
}

export {
  applyMarkEvent,
  reverseAndCorrect,
  overrideMarks,
  correctLedgerEvent,
  manualScore,
  recalculateStudent,
  recalculateBatch,
  getStudentLedgerEvents,
};

export default {
  applyMarkEvent,
  reverseAndCorrect,
  overrideMarks,
  correctLedgerEvent,
  manualScore,
  recalculateStudent,
  recalculateBatch,
  getStudentLedgerEvents,
};