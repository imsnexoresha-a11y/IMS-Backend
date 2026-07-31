import {
    Quiz,
    QuizResult,
    QuizUpload,
    Session,
    Student,
    User,
} from '../models/index.js';
import { CustomError } from '../../utils/customError.js';
import { applyMarkEvent } from './pointsService.js';

async function resolveStudent(row) {
    if (row.studentId) return Student.findById(row.studentId);

    const email = row.student_email || row.email;
    const user = await User.findOne({ email });
    if (!user) return null;

    return Student.findOne({ userId: user._id });
}

export async function createQuizService(data) {
    const payload = {
        ...data,
        sessionId: data.sessionId || data.lectureId || data.topicId || `sess-${Date.now()}`,
        link: data.link || data.externalUrl || '',
        submissionDeadline: data.submissionDeadline ? new Date(data.submissionDeadline) : new Date(Date.now() + 7 * 86400000),
        totalMarks: Number(data.totalMarks || data.maxScore || 100),
        passingMarks: Number(data.passingMarks || Math.round((data.totalMarks || data.maxScore || 100) * 0.4)),
        totaldurationInMins: Number(data.totaldurationInMins || data.durationInMins || 30),
    };
    return Quiz.create(payload);
}

export async function getAllQuizzesService(req) {
    if (req?.user?.id) {
        const student = await Student.findOne({
            $or: [{ _id: req.user.id }, { userId: req.user.id }],
        }).lean();

        if (student) {
            if (!student.batchId) {
                return [];
            }
            return Quiz.find({ batchId: student.batchId }).sort({ createdAt: -1 }).lean();
        }
    }

    return Quiz.find().sort({ createdAt: -1 }).lean();
}

export async function getQuizByIdService(id) {
    const quiz = await Quiz.findById(id);
    if (!quiz) throw new CustomError('Quiz not found.', 404);
    return quiz;
}

export async function updateQuizService(id, data) {
    const quiz = await Quiz.findByIdAndUpdate(id, data, {
        new: true,
        runValidators: true,
    });

    if (!quiz) throw new CustomError('Quiz not found.', 404);
    return quiz;
}

export async function deleteQuizService(id) {
    const quiz = await Quiz.findById(id);
    if (!quiz) throw new CustomError('Quiz not found.', 404);

    await QuizResult.deleteMany({ quizId: id });
    await Quiz.findByIdAndDelete(id);

    return { deleted: true };
}

export async function uploadLectureQuizResultsService({
    lectureId,
    teacherId,
    quiz,
}) {
    const session = await Session.findById(lectureId);
    if (!session) throw new CustomError('Lecture/session not found', 404);

    if (['cancelled', 'scheduled'].includes(String(session.status).toLowerCase())) {
        throw new CustomError(
            'Quiz can only be uploaded for in-progress or completed lectures',
            400,
        );
    }

    const batchStudents = await Student.find({ batchId: session.batchId });
    const previousResults = await QuizResult.find({ lectureId });
    const previousMap = new Map(
        previousResults.map((record) => [record.studentId, record.marksApplied || record.score || 0]),
    );

    const inputMap = new Map();

    for (let i = 0; i < quiz.length; i += 1) {
        const row = quiz[i];
        const student = await resolveStudent(row);

        if (!student) {
            throw new CustomError(
                row.studentId
                    ? `Student not found: ${row.studentId}`
                    : `Student email not found: ${row.student_email || row.email}`,
                404,
            );
        }

        inputMap.set(student._id, {
            student,
            score: Number(row.score),
            feedback: row.feedback || '',
        });
    }

    const summary = [];

    for (const student of batchStudents) {
        const uploaded = inputMap.get(student._id);

        const score = uploaded ? uploaded.score : -2.5;
        const storedScore = uploaded ? uploaded.score : 0;
        const oldMarks = previousMap.get(student._id) || 0;
        const delta = score - oldMarks;

        const record = await QuizResult.findOneAndUpdate(
            { lectureId, studentId: student._id },
            {
                studentId: student._id,
                quizId: lectureId,
                lectureId,
                totalMarks: 5,
                marksObtained: storedScore,
                score: storedScore,
                marksApplied: score,
                percentage: uploaded ? (storedScore / 5) * 100 : 0,
                submittedAt: new Date(),
                uploadedBy: teacherId,
                feedback: uploaded ? uploaded.feedback : 'Student missing from uploaded quiz data',
                result: uploaded ? 'pending' : 'failed',
            },
            { new: true, upsert: true, runValidators: true },
        );
        console.log({
            studentId: student._id,
            batchId: student.batchId,
        });
        if (delta !== 0) {
            await applyMarkEvent({
                studentId: student._id,
                batchId: student.batchId,
                lectureId,
                eventType: 'quiz',
                marksApplied: delta,
                meta: { quizResultId: record._id, replacement: oldMarks !== 0 },
            });
        }

        summary.push({
            studentId: student._id,
            score: storedScore,
            marksApplied: score,
            oldMarks,
            delta,
            quizMissed: !uploaded,
        });
    }

    await QuizUpload.create({
        lectureId,
        uploadedBy: teacherId,
        payload: quiz,
        processed: summary.length,
        errors: [],
        replacedPrevious: previousResults.length > 0,
    });

    return {
        processed: summary.length,
        errors: [],
        summary,
    };
}

export async function getLectureQuizResultsService(lectureId) {
    const session = await Session.findById(lectureId);
    if (!session) throw new CustomError('Lecture/session not found', 404);

    const quizResults = await QuizResult.find({ lectureId });

    return {
        totalStudents: quizResults.length,
        quizResults,
    };
}

export async function uploadQuizResultsService(data) {
    const { quizId, results } = data;

    if (!Array.isArray(results)) {
        throw new CustomError('results must be an array', 400);
    }

    const uploadedResults = [];

    for (const row of results) {
        const student = await Student.findById(row.studentId);
        if (!student) throw new CustomError(`Student not found: ${row.studentId}`, 404);

        const score = Number(row.score);
        if (Number.isNaN(score) || score < 0 || score > 5) {
            throw new CustomError(`Invalid score for ${row.studentId}`, 400);
        }

        const result = await QuizResult.findOneAndUpdate(
            { quizId, studentId: row.studentId },
            {
                quizId,
                studentId: row.studentId,
                totalMarks: 5,
                marksObtained: score,
                score,
                marksApplied: score,
                percentage: (score / 5) * 100,
                submittedAt: new Date(),
                feedback: row.feedback || '',
            },
            { new: true, upsert: true, runValidators: true },
        );

        uploadedResults.push(result);
    }

    return uploadedResults;
}

export async function getQuizResultsService(quizId) {
    return QuizResult.find({ quizId }).sort({ createdAt: -1 });
}

export async function getStudentQuizResultsService(studentId) {
    return QuizResult.find({ studentId }).sort({ createdAt: -1 });
}