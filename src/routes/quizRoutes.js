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
    requireRole(['teacher', 'instructor']),
    validateQuizUpload,
    quizController.uploadLectureQuizResults,
);

router.get(
    '/teacher/lectures/:id/quiz',
    verifyToken,
    requireRole(['teacher', 'instructor']),
    quizController.getLectureQuizResults,
);

router.post('/', validateCreateQuiz, quizController.createQuiz);
router.get('/', verifyToken, quizController.getAllQuizzes);
router.get('/:id', quizController.getQuizById);
router.put('/:id', validateCreateQuiz, quizController.updateQuiz);
router.delete('/:id', quizController.deleteQuiz);

router.post(
    '/upload-results',
    validateQuizUpload,
    quizController.uploadQuizResults,
);

router.get('/results/:quizId', quizController.getQuizResults);
router.get('/student/:studentId', quizController.getStudentQuizResults);

export default router;