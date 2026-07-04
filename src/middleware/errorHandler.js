import { CustomError } from '../../utils/customError.js';

export function notFoundHandler(_req, _res, next) {
  next(new CustomError('Route not found', 404));
}

export function errorHandler(error, _req, res, _next) {
  const statusCode = error.statusCode || 500;

  res.status(statusCode).json({
    message: error.message || 'Internal server error',
    statusCode,
  });
}