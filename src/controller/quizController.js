import {
    createQuizService,
    getAllQuizzesService,
    getQuizByIdService,
    updateQuizService,
    deleteQuizService,
    uploadLectureQuizResultsService,
    getLectureQuizResultsService,
    uploadQuizResultsService,
    getQuizResultsService,
    getStudentQuizResultsService,
} from '../service/quizService.js';

export async function createQuiz(req, res, next) {
    try {
        const data = await createQuizService(req.body);
        res.status(201).json({ success: true, data, message: 'Quiz created successfully.' });
    } catch (error) {
        next(error);
    }
}

export async function getAllQuizzes(req, res, next) {
    try {
        const data = await getAllQuizzesService(req);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

export async function getQuizById(req, res, next) {
    try {
        const data = await getQuizByIdService(req.params.id);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

export async function updateQuiz(req, res, next) {
    try {
        const data = await updateQuizService(req.params.id, req.body);
        res.status(200).json({ success: true, data, message: 'Quiz updated successfully.' });
    } catch (error) {
        next(error);
    }
}

export async function deleteQuiz(req, res, next) {
    try {
        const data = await deleteQuizService(req.params.id);
        res.status(200).json({ success: true, data, message: 'Quiz deleted successfully.' });
    } catch (error) {
        next(error);
    }
}

export async function uploadLectureQuizResults(req, res, next) {
    try {
        const data = await uploadLectureQuizResultsService({
            lectureId: req.params.id,
            teacherId: req.user?.id,
            quiz: req.body.quiz,
        });

        res.status(200).json({
            success: true,
            data,
            message: 'Quiz results processed successfully.',
        });
    } catch (error) {
        next(error);
    }
}

export async function getLectureQuizResults(req, res, next) {
    try {
        const data = await getLectureQuizResultsService(req.params.id);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

export async function uploadQuizResults(req, res, next) {
    try {
        const data = await uploadQuizResultsService(req.body);
        res.status(200).json({
            success: true,
            data,
            message: 'Quiz results uploaded successfully.',
        });
    } catch (error) {
        next(error);
    }
}

export async function getQuizResults(req, res, next) {
    try {
        const data = await getQuizResultsService(req.params.quizId);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

export async function getStudentQuizResults(req, res, next) {
    try {
        const data = await getStudentQuizResultsService(req.params.studentId);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}