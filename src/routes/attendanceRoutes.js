import { Router } from 'express';
import {
  uploadAttendance,
  getAttendance,
} from '../controller/attendanceController.js';
import { validateAttendanceRequest } from '../validator/attendanceValidator.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = Router();

router.post(
  '/teacher/lectures/:id/attendance',
  verifyToken,
  requireRole(['admin', 'teacher', 'instructor']),
  validateAttendanceRequest,
  uploadAttendance,
);

router.get(
  '/teacher/lectures/:id/attendance',
  verifyToken,
  requireRole(['admin', 'teacher', 'instructor']),
  getAttendance,
);

export default router;