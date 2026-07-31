import marksService from '../service/marksService.js';

function sendSuccess(res, statusCode, result) {
    const { message, ...data } = result;

    return res.status(statusCode).json({
        success: true,
        data,
        message,
    });
}

async function overrideMarks(req, res, next) {
    try {
        const result = await marksService.overrideMarks(req.body, req.user.id);
        sendSuccess(res, 200, result);
    } catch (error) {
        next(error);
    }
}

async function correctLedgerEvent(req, res, next) {
    try {
        const result = await marksService.correctLedgerEvent(req.body, req.user.id);
        sendSuccess(res, 200, result);
    } catch (error) {
        next(error);
    }
}

async function manualScore(req, res, next) {
    try {
        const result = await marksService.manualScore(req.body, req.user.id);
        sendSuccess(res, 200, result);
    } catch (error) {
        next(error);
    }
}

async function recalculateStudent(req, res, next) {
    try {
        const result = await marksService.recalculateStudent(
            req.params.studentId,
            req.body.reason,
            req.user.id,
        );

        sendSuccess(res, 200, result);
    } catch (error) {
        next(error);
    }
}

async function recalculateBatch(req, res, next) {
    try {
        const result = await marksService.recalculateBatch(
            req.params.batchId,
            req.body.reason,
            req.user.id,
        );

        sendSuccess(res, 200, result);
    } catch (error) {
        next(error);
    }
}

async function getStudentLedgerEvents(req, res, next) {
    try {
        const events = await marksService.getStudentLedgerEvents(req.params.studentId);
        res.status(200).json({
            success: true,
            message: 'Student ledger events retrieved successfully',
            data: events,
        });
    } catch (error) {
        next(error);
    }
}

export {
    overrideMarks,
    correctLedgerEvent,
    manualScore,
    recalculateStudent,
    recalculateBatch,
    getStudentLedgerEvents,
};