import { body, param } from 'express-validator';
import { validationResult } from 'express-validator';

export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array(),
    });
  }
  next();
};

export const createCourseValidator = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Course name is required')
    .isLength({ max: 200 })
    .withMessage('Course name cannot exceed 200 characters'),
  body('batchId')
    .trim()
    .notEmpty()
    .withMessage('batchId is required')
    .isString()
    .withMessage('batchId must be a string'),
  body('instructorIds')
    .optional()
    .isArray()
    .withMessage('instructorIds must be an array of instructor UUIDs'),
  body('instructorIds.*')
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Instructor ID must be a non-empty string'),
  handleValidationErrors,
];

export const createTopicValidator = [
  body('batchId')
    .trim()
    .notEmpty()
    .withMessage('batchId is required')
    .isString()
    .withMessage('batchId must be a string'),
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Topic title is required')
    .isLength({ max: 120 })
    .withMessage('Topic title cannot exceed 120 characters'),
  body('description')
    .trim()
    .notEmpty()
    .withMessage('Topic description (rich text HTML) is required'),
  body('learningObjectives')
    .customSanitizer((value) => {
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch (e) {
          return value; // Keep value so validation fails if not array-like
        }
      }
      return value;
    })
    .isArray({ min: 1, max: 10 })
    .withMessage('learningObjectives must be an array with 1 to 10 objectives'),
  body('learningObjectives.*')
    .trim()
    .notEmpty()
    .withMessage('Each learning objective must be a non-empty string'),
  body('estimatedHours')
    .notEmpty()
    .withMessage('estimatedHours is required')
    .isFloat({ min: 0 })
    .withMessage('estimatedHours must be a non-negative number'),
  body('orderIndex')
    .optional()
    .isInt({ min: 0 })
    .withMessage('orderIndex must be a non-negative integer'),
  handleValidationErrors,
];

export const updateTopicValidator = [
  param('id')
    .trim()
    .notEmpty()
    .withMessage('Topic ID parameter is required'),
  body('title')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Topic title cannot be empty')
    .isLength({ max: 120 })
    .withMessage('Topic title cannot exceed 120 characters'),
  body('description')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Topic description cannot be empty'),
  body('learningObjectives')
    .optional()
    .customSanitizer((value) => {
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch (e) {
          return value;
        }
      }
      return value;
    })
    .isArray({ min: 1, max: 10 })
    .withMessage('learningObjectives must contain between 1 and 10 objectives'),
  body('learningObjectives.*')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Each learning objective must be a non-empty string'),
  body('estimatedHours')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('estimatedHours must be a non-negative number'),
  handleValidationErrors,
];

export const reorderTopicsValidator = [
  body('topicIds')
    .isArray({ min: 1 })
    .withMessage('topicIds must be a non-empty array of topic UUIDs'),
  body('topicIds.*')
    .trim()
    .notEmpty()
    .withMessage('Each topicId must be a non-empty string'),
  handleValidationErrors,
];

export const createSessionValidator = [
  body('batchId')
    .trim()
    .notEmpty()
    .withMessage('batchId is required')
    .isString()
    .withMessage('batchId must be a string'),
  body('courseId')
    .optional({ checkFalsy: true })
    .isString()
    .withMessage('courseId must be a string'),
  body('topicIds')
    .optional()
    .customSanitizer((value) => {
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch (e) {
          return value;
        }
      }
      return value;
    }),
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Session title is required')
    .isLength({ max: 150 })
    .withMessage('Session title cannot exceed 150 characters'),
  body('sessionDateAndTime')
    .notEmpty()
    .withMessage('sessionDateAndTime is required')
    .isISO8601()
    .withMessage('sessionDateAndTime must be a valid ISO8601 date string'),
  body('duration')
    .trim()
    .notEmpty()
    .withMessage('duration is required')
    .isString()
    .withMessage('duration must be a string'),
  body('startTime')
    .trim()
    .notEmpty()
    .withMessage('startTime is required')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('startTime must be in HH:MM format'),
  body('endTime')
    .trim()
    .notEmpty()
    .withMessage('endTime is required')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('endTime must be in HH:MM format'),
  body('half1EndTime')
    .trim()
    .notEmpty()
    .withMessage('half1EndTime is required')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('half1EndTime must be in HH:MM format'),
  body('meetUrl')
    .trim()
    .notEmpty()
    .withMessage('meetUrl is required')
    .isURL()
    .withMessage('meetUrl must be a valid URL'),
  body('assignmentTitle')
    .optional({ checkFalsy: true })
    .trim()
    .notEmpty()
    .withMessage('assignmentTitle cannot be empty'),
  body('assignmentDescription')
    .optional({ checkFalsy: true })
    .trim()
    .notEmpty()
    .withMessage('assignmentDescription cannot be empty'),
  body('assignmentDeadline')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('assignmentDeadline must be a valid ISO8601 date string')
    .custom((value, { req }) => {
      if (!value) return true;
      const sessionStart = new Date(req.body.sessionDateAndTime);
      const deadline = new Date(value);
      if (isNaN(sessionStart.getTime())) {
        return true;
      }
      
      let sessionEnd;
      if (req.body.endTime && req.body.endTime.includes(':')) {
        const datePart = req.body.sessionDateAndTime.split('T')[0];
        sessionEnd = new Date(`${datePart}T${req.body.endTime}:00.000Z`);
        // Handle midnight wraparound
        if (req.body.startTime && req.body.endTime < req.body.startTime) {
          sessionEnd = new Date(sessionEnd.getTime() + 24 * 60 * 60 * 1000);
        }
      } else {
        // Parse duration to calculate end time
        const durationStr = req.body.duration || '0';
        const num = parseFloat(durationStr);
        let durationMs = 0;
        if (!isNaN(num)) {
          const lower = durationStr.toLowerCase();
          if (lower.includes('second') || lower.includes('sec')) {
            durationMs = num * 1000;
          } else if (lower.includes('hour')) {
            durationMs = num * 60 * 60 * 1000;
          } else {
            durationMs = num * 60 * 1000;
          }
        }
        sessionEnd = new Date(sessionStart.getTime() + durationMs);
      }
      
      const minDeadline = new Date(sessionEnd.getTime() + 60 * 60 * 1000); // End time + 1 hour

      if (deadline < minDeadline) {
        throw new Error('assignmentDeadline must be at least 1 hour after the session scheduled end time');
      }
      return true;
    }),
  body('githubRepoSeed')
    .optional({ checkFalsy: true })
    .trim()
    .isURL()
    .withMessage('githubRepoSeed must be a valid URL'),
  handleValidationErrors,
];

export const updateSessionValidator = [
  param('id')
    .trim()
    .notEmpty()
    .withMessage('Session ID parameter is required'),
  body('batchId')
    .optional()
    .trim()
    .isString()
    .withMessage('batchId must be a string'),
  body('courseId')
    .optional()
    .trim()
    .isString()
    .withMessage('courseId must be a string'),
  body('topicIds')
    .optional()
    .customSanitizer((value) => {
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch (e) {
          return value;
        }
      }
      return value;
    })
    .isArray({ min: 1 })
    .withMessage('topicIds must be a non-empty array of topic IDs'),
  body('topicIds.*')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Each topicId must be a non-empty string'),
  body('title')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Session title cannot be empty')
    .isLength({ max: 150 })
    .withMessage('Session title cannot exceed 150 characters'),
  body('sessionDateAndTime')
    .optional()
    .isISO8601()
    .withMessage('sessionDateAndTime must be a valid ISO8601 date string')
    .custom((value) => {
      if (new Date(value) <= new Date()) {
        throw new Error('sessionDateAndTime must be a future date and time');
      }
      return true;
    }),
  body('duration')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('duration cannot be empty'),
  body('meetUrl')
    .optional()
    .trim()
    .isURL()
    .withMessage('meetUrl must be a valid URL'),
  body('assignmentTitle')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('assignmentTitle cannot be empty'),
  body('assignmentDescription')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('assignmentDescription cannot be empty'),
  body('assignmentDeadline')
    .optional()
    .isISO8601()
    .withMessage('assignmentDeadline must be a valid ISO8601 date string'),
  body('githubRepoSeed')
    .optional({ checkFalsy: true })
    .trim()
    .isURL()
    .withMessage('githubRepoSeed must be a valid URL'),
  handleValidationErrors,
];

export const transitionStatusValidator = [
  param('id')
    .trim()
    .notEmpty()
    .withMessage('Session ID parameter is required'),
  body('status')
    .trim()
    .notEmpty()
    .withMessage('status is required')
    .isIn(['In Progress', 'completed', 'cancelled', 'postponed', 'scheduled'])
    .withMessage('status must be one of: In Progress, completed, cancelled, postponed, scheduled'),
  handleValidationErrors,
];

export const updateProfileValidator = [
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Name cannot be empty')
    .isLength({ max: 100 })
    .withMessage('Name cannot exceed 100 characters'),
  body('designation')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Designation cannot be empty')
    .isLength({ max: 100 })
    .withMessage('Designation cannot exceed 100 characters'),
  body('bio')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Bio cannot exceed 1000 characters'),
  body('linkedInUrl')
    .optional({ checkFalsy: true })
    .trim()
    .isURL()
    .withMessage('linkedInUrl must be a valid URL'),
  handleValidationErrors,
];

export const batchIdParamValidator = [
  param('batchId')
    .trim()
    .notEmpty()
    .withMessage('Batch ID parameter is required'),
  handleValidationErrors,
];

export const sessionIdParamValidator = [
  param('sessionId')
    .trim()
    .notEmpty()
    .withMessage('Session ID parameter is required'),
  handleValidationErrors,
];
