import { Router } from 'express';
import * as quizController from '../controller/quizController.js';
import {
    validateCreateQuiz,
    validateQuizUpload,
} from '../validator/quizValidator.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = Router();

router.post(
    '/teacher/lectures/:id/quiz',
    verifyToken,
    requireRole(['admin', 'teacher', 'instructor']),
    validateQuizUpload,
    quizController.uploadLectureQuizResults,
);

router.get(
    '/teacher/lectures/:id/quiz',
    verifyToken,
    requireRole(['admin', 'teacher', 'instructor']),
    quizController.getLectureQuizResults,
);

router.post('/', verifyToken, requireRole(['admin', 'teacher', 'instructor']), validateCreateQuiz, quizController.createQuiz);
router.get('/', verifyToken, quizController.getAllQuizzes);
router.get('/:id', quizController.getQuizById);
router.put('/:id', verifyToken, requireRole(['admin', 'teacher', 'instructor']), validateCreateQuiz, quizController.updateQuiz);
router.delete('/:id', verifyToken, requireRole(['admin', 'teacher', 'instructor']), quizController.deleteQuiz);

router.post(
    '/upload-results',
    validateQuizUpload,
    quizController.uploadQuizResults,
);

router.get('/results/:quizId', quizController.getQuizResults);
router.get('/student/:studentId', quizController.getStudentQuizResults);

export default router;