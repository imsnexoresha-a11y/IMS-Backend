module.exports = {
  ROLES: { ADMIN: 'admin', TEACHER: 'teacher', STUDENT: 'student' },
  LECTURE_STATUS: { SCHEDULED: 'scheduled', IN_PROGRESS: 'in_progress', COMPLETED: 'completed', CANCELLED: 'cancelled' },
  ASSIGNMENT_STATUS: { UNPUBLISHED: 'unpublished', PUBLISHED: 'published', CLOSED: 'closed' },
  SUBMISSION_STATUS: { PENDING: 'pending', COMPLETED: 'completed', ERROR: 'error' },
  HALF_ATTENDED: { BOTH: 'both', HALF1: '1', HALF2: '2', NONE: 'none' },
  LEDGER_EVENT: { ATTENDANCE: 'attendance', QUIZ: 'quiz', ASSIGNMENT: 'assignment', ADMIN_OVERRIDE: 'admin_override', REVERSAL: 'reversal' },
  AUDIT_ACTION: { MARK_OVERRIDE: 'MARK_OVERRIDE', EVENT_CORRECTION: 'EVENT_CORRECTION', PARAM_CHANGE: 'PARAM_CHANGE', MANUAL_SCORE: 'MANUAL_SCORE', CSV_REPLACE: 'CSV_REPLACE', RECALC_TRIGGER: 'RECALC_TRIGGER' },
  AUDIT_TARGET: { STUDENT: 'student', LECTURE: 'lecture', BATCH: 'batch', SUBMISSION: 'submission' },
  NOTIFICATION_TYPE: { LECTURE_SCHEDULED: 'lecture_scheduled', LECTURE_REMINDER: 'lecture_reminder', ASSIGNMENT_PUBLISHED: 'assignment_published', DEADLINE_APPROACHING: 'deadline_approaching', REVIEW_COMPLETE: 'review_complete', MARKS_UPDATED: 'marks_updated', REVIEW_ERROR: 'review_error' },
};
