import { CustomError } from '../../utils/customError.js';

export function validateAssignmentSubmission(req, _res, next) {
  const { gitSubmissionLink } = req.body;

  if (!gitSubmissionLink || gitSubmissionLink.trim() === '') {
    throw new CustomError('Git submission link is required', 400);
  }

  const githubRepoPattern = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/;
  if (!githubRepoPattern.test(gitSubmissionLink.trim())) {
    throw new CustomError('Git submission link must be a valid GitHub repository URL', 400);
  }

  next();
}

export function validateProfileUpdate(req, _res, next) {
  const { name, email, mobileNo, gitHubUrl, linkedInUrl } = req.body;

  if (name !== undefined && name.trim().length < 2) {
    throw new CustomError('Name must be at least 2 characters long', 400);
  }

  if (email !== undefined && !/^\S+@\S+\.\S+$/.test(email)) {
    throw new CustomError('Invalid email format', 400);
  }

  if (mobileNo !== undefined && mobileNo.trim().length < 10) {
    throw new CustomError('Mobile number must be at least 10 characters long', 400);
  }

  if (gitHubUrl !== undefined && gitHubUrl && !/^(https?:\/\/)?(www\.)?github\.com\/.+/i.test(gitHubUrl)) {
    throw new CustomError('Invalid GitHub profile URL', 400);
  }

  if (linkedInUrl !== undefined && linkedInUrl && !/^(https?:\/\/)?(www\.)?linkedin\.com\/.+/i.test(linkedInUrl)) {
    throw new CustomError('Invalid LinkedIn URL', 400);
  }

  next();
}

export function validatePagination(req, _res, next) {
  const { page = 1, limit = 10 } = req.query;
  const pageNum = Number(page);
  const limitNum = Number(limit);

  if (!Number.isInteger(pageNum) || pageNum < 1) {
    throw new CustomError('Page must be a positive number', 400);
  }

  if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > 100) {
    throw new CustomError('Limit must be between 1 and 100', 400);
  }

  next();
}

export function validateAssignmentId(req, _res, next) {
  const { id } = req.params;

  if (!id || id.trim() === '') {
    throw new CustomError('Assignment ID is required', 400);
  }

  next();
}

export function validateNotificationId(req, _res, next) {
  const { id } = req.params;

  if (!id || id.trim() === '') {
    throw new CustomError('Notification ID is required', 400);
  }

  next();
}

export function validateCreateStudent(req, _res, next) {
  const { enrollementNo, dob, batchId, name, email, mobileNo, password, profileStatus = 'Active' } = req.body;

  if (!enrollementNo || enrollementNo.trim() === '') {
    throw new CustomError('Enrollment number is required', 400);
  }

  if (!dob || Number.isNaN(new Date(dob).getTime())) {
    throw new CustomError('Valid date of birth is required', 400);
  }

  if (!batchId || batchId.trim() === '') {
    throw new CustomError('Batch ID is required', 400);
  }

  if (!name || name.trim().length < 2) {
    throw new CustomError('Name must be at least 2 characters long', 400);
  }

  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    throw new CustomError('Valid email is required', 400);
  }

  if (!mobileNo || mobileNo.trim().length < 10) {
    throw new CustomError('Valid mobile number is required', 400);
  }

  if (!password || password.trim() === '') {
    throw new CustomError('Password is required', 400);
  }

  if (!['Active', 'Inactive', 'blocked'].includes(profileStatus)) {
    throw new CustomError('Profile status must be one of: Active, Inactive, blocked', 400);
  }

  next();
}
