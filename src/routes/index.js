import { Router } from 'express';
import healthRoutes from './healthRoutes.js';
import attendanceRoutes from './attendanceRoutes.js';
import quizRoutes from './quizRoutes.js';
import instructorRoutes from './instructorRoutes.js';
import adminRoutes from './adminRoutes.js';
import metricsRoutes from './metricsRoutes.js';
import studentRoutes from './studentRoutes.js';
import auditRoutes from './auditRoutes.js';
import marksRoutes from './marksRoutes.js';
import authRoutes from './authRoutes.js';
import assignmentSubmissionRoutes from './assignmentSubmissionRoutes.js';
import recruiterRoutes from './recruiterRoutes.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);

router.use('/instructor', instructorRoutes);
router.use('/recruiter', recruiterRoutes);

router.use('/students', studentRoutes);
router.use('/student', studentRoutes);

router.use('/attendance', attendanceRoutes);
router.use('/quizzes', quizRoutes);

router.use('/admin', adminRoutes);
router.use('/admin/audit-log', auditRoutes);
router.use('/admin/marks', marksRoutes);

router.use('/metrics', metricsRoutes);
router.use('/assignment-submissions', assignmentSubmissionRoutes);

// Root level mounts for /teacher/lectures/:id/attendance and /teacher/lectures/:id/quiz
router.use('/', attendanceRoutes);
router.use('/', quizRoutes);

export default router;