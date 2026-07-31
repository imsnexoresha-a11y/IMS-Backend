import * as curriculumService from '../service/curriculumService.js';
import * as sessionService from '../service/sessionService.js';
import * as profileService from '../service/profileService.js';
import * as notificationService from '../service/notificationService.js';
import { Instructor, Topic, Session, Assignment } from '../models/index.js';
import { CustomError } from '../../utils/customError.js';
import { cloudinary, isCloudinaryConfigured } from '../../config/cloudinary.js';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';
import path from 'path';
import fs from 'fs';


// Multer storage setup with Cloudinary fallback
let storage;
if (isCloudinaryConfigured) {
  storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
      const cleanOriginalName = path.parse(file.originalname).name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const ext = path.extname(file.originalname);
      return {
        folder: 'curriculum_notes',
        public_id: `${cleanOriginalName}_${Date.now()}${ext}`,
        resource_type: 'raw',
      };
    },
  });
} else {
  const uploadDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const cleanOriginalName = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');
      cb(null, `${Date.now()}_${cleanOriginalName}`);
    }
  });
}

// File filter to restrict uploads to PDF, MD, and DOCX files
const fileFilter = (req, file, cb) => {
  const allowedExtensions = ['.pdf', '.md', '.docx'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new CustomError('Invalid file type. Only PDF, MD, and DOCX are allowed.', 400), false);
  }
};

// Multer middleware setup
export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB limit per file
  },
});

// Helper wrapper for async controller handlers to catch errors
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Helper to resolve Instructor document ID from User JWT ID
async function getInstructorId(userId) {
  const instructor = await Instructor.findOne({ userId });
  if (!instructor) {
    throw new CustomError('Instructor profile not found for this user', 404);
  }
  return instructor._id;
}

/**
 * POST /api/v1/instructor/courses
 */
export const createCourse = asyncHandler(async (req, res) => {
  const instructorId = await getInstructorId(req.user.id);
  const courseData = {
    ...req.body,
    instructorIds: [...new Set([...(req.body.instructorIds || []), instructorId])],
  };
  const course = await curriculumService.createCourse(courseData);
  res.status(201).json({
    success: true,
    message: 'Course created successfully',
    data: course,
  });
});

/**
 * GET /api/v1/instructor/courses
 */
export const getCourses = asyncHandler(async (req, res) => {
  const instructorId = await getInstructorId(req.user.id);
  const courses = await curriculumService.getCoursesByInstructor(instructorId);
  res.status(200).json({
    success: true,
    data: courses,
  });
});

/**
 * GET /api/v1/instructor/topics/:batchId
 */
export const getTopics = asyncHandler(async (req, res) => {
  const topics = await curriculumService.getTopicsByBatch(req.params.batchId);
  res.status(200).json({
    success: true,
    data: topics,
  });
});

/**
 * POST /api/v1/instructor/topics
 */
export const createTopic = asyncHandler(async (req, res) => {
  if (req.files && req.files.length > 0 && !isCloudinaryConfigured) {
    throw new CustomError('Cloud storage service is currently unavailable. Upload blocked.', 503);
  }
  // Extract files path from multer files upload array if present
  const notesFiles = req.files ? req.files.map((file) => (file.path ? file.path.replace(/\\/g, '/') : '')) : [];

  // Parse learningObjectives if sent as JSON string or handle if already array
  let learningObjectives = req.body.learningObjectives;
  if (typeof learningObjectives === 'string') {
    try {
      learningObjectives = JSON.parse(learningObjectives);
    } catch {
      throw new CustomError('learningObjectives must be a valid JSON array', 400);
    }
  }

  const topicData = {
    batchId: req.body.batchId,
    title: req.body.title,
    description: req.body.description,
    learningObjectives,
    estimatedHours: Number(req.body.estimatedHours),
    orderIndex: req.body.orderIndex !== undefined ? Number(req.body.orderIndex) : undefined,
    notesFiles,
  };

  const topic = await curriculumService.createTopic(topicData);
  res.status(201).json({
    success: true,
    message: 'Curriculum topic created successfully',
    data: topic,
  });
});

/**
 * PUT /api/v1/instructor/topics/:id
 */
export const updateTopic = asyncHandler(async (req, res) => {
  let learningObjectives = req.body.learningObjectives;
  if (learningObjectives && typeof learningObjectives === 'string') {
    try {
      learningObjectives = JSON.parse(learningObjectives);
    } catch {
      throw new CustomError('learningObjectives must be a valid JSON array', 400);
    }
  }

  const updateData = { ...req.body };
  if (learningObjectives) {
    updateData.learningObjectives = learningObjectives;
  }
  if (updateData.estimatedHours !== undefined) {
    updateData.estimatedHours = Number(updateData.estimatedHours);
  }

  const topic = await curriculumService.updateTopic(req.params.id, updateData);
  res.status(200).json({
    success: true,
    message: 'Curriculum topic updated successfully',
    data: topic,
  });
});

/**
 * DELETE /api/v1/instructor/topics/:id
 */
export const deleteTopic = asyncHandler(async (req, res) => {
  await curriculumService.deleteTopic(req.params.id);
  res.status(200).json({
    success: true,
    message: 'Curriculum topic deleted successfully',
  });
});

/**
 * PATCH /api/v1/instructor/topics/reorder
 */
export const reorderTopics = asyncHandler(async (req, res) => {
  await curriculumService.reorderTopics(req.body.topicIds);
  res.status(200).json({
    success: true,
    message: 'Topics reordered successfully',
  });
});

/**
 * POST /api/v1/instructor/topics/:id/notes
 */
export const uploadNotes = asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    throw new CustomError('No notes files uploaded', 400);
  }

  // If using local storage, construct the URL pointing to the static folder
  const filePaths = req.files.map((file) => {
    if (file.path) {
      if (file.path.startsWith('http')) {
        return file.path; // Cloudinary URL
      } else {
        return `http://localhost:4000/uploads/${file.filename}`; // Local static URL
      }
    }
    return '';
  });

  const topic = await curriculumService.addTopicNotes(req.params.id, filePaths);

  res.status(200).json({
    success: true,
    message: 'Notes uploaded successfully',
    data: topic,
  });
});

/**
 * DELETE /api/v1/instructor/topics/:id/notes/:fileId
 */
export const deleteNote = asyncHandler(async (req, res) => {
  await curriculumService.deleteTopicNoteByFilename(req.params.id, req.params.fileId);
  res.status(200).json({
    success: true,
    message: 'Note deleted successfully',
  });
});

/**
 * PUT /api/v1/instructor/courses/:id (Admin-only action)
 */
export const updateCourse = asyncHandler(async (req, res) => {
  const course = await curriculumService.updateCourse(req.params.id, req.body);
  res.status(200).json({
    success: true,
    message: 'Course updated successfully',
    data: course,
  });
});

/**
 * DELETE /api/v1/instructor/courses/:id (Admin-only action)
 */
export const deleteCourse = asyncHandler(async (req, res) => {
  await curriculumService.deleteCourse(req.params.id);
  res.status(200).json({
    success: true,
    message: 'Course deleted successfully',
  });
});

/**
 * POST /api/v1/instructor/sessions
 */
export const createSession = asyncHandler(async (req, res) => {
  const session = await sessionService.createSession(
    req.body,
    req.user.id,
    req.user.role
  );
  res.status(201).json({
    success: true,
    message: 'Session created and scheduled successfully',
    data: session,
  });
});

/**
 * GET /api/v1/instructor/sessions/:batchId
 */
export const getSessions = asyncHandler(async (req, res) => {
  const sessions = await sessionService.getSessionsByBatch(req.params.batchId);
  res.status(200).json({
    success: true,
    data: sessions,
  });
});

/**
 * PUT /api/v1/instructor/sessions/:id
 */
export const updateSession = asyncHandler(async (req, res) => {
  const session = await sessionService.updateSession(req.params.id, req.body);
  res.status(200).json({
    success: true,
    message: 'Session updated successfully',
    data: session,
  });
});

/**
 * PATCH /api/v1/instructor/sessions/:id/status
 */
export const transitionSessionStatus = asyncHandler(async (req, res) => {
  const session = await sessionService.transitionSessionStatus(req.params.id, req.body.status);
  res.status(200).json({
    success: true,
    message: 'Session status updated successfully',
    data: session,
  });
});

/**
 * DELETE /api/v1/instructor/sessions/:id
 */
export const deleteSession = asyncHandler(async (req, res) => {
  await sessionService.deleteSession(req.params.id);
  res.status(200).json({
    success: true,
    message: 'Session deleted successfully',
  });
});

// Ensure uploads/instructors directory exists
const photoUploadDir = 'uploads/instructors';
if (!fs.existsSync(photoUploadDir)) {
  fs.mkdirSync(photoUploadDir, { recursive: true });
}

// Multer photo upload configuration
let photoStorage;
if (isCloudinaryConfigured) {
  photoStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'instructors',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    },
  });
} else {
  photoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, photoUploadDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
  });
}

const photoFileFilter = (req, file, cb) => {
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new CustomError('Invalid photo format. Only JPG, JPEG, PNG, and WEBP images are allowed.', 400), false);
  }
};

export const uploadPhoto = multer({
  storage: photoStorage,
  fileFilter: photoFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

/**
 * GET /api/v1/instructor/profile
 */
export const getProfile = asyncHandler(async (req, res) => {
  const profile = await profileService.getInstructorProfile(req.user.id);
  res.status(200).json({
    success: true,
    data: profile,
  });
});

/**
 * PUT /api/v1/instructor/profile
 */
export const updateProfile = asyncHandler(async (req, res) => {
  let profileImagePath;
  if (req.file) {
    if (!isCloudinaryConfigured) {
      console.warn('[InstructorController] Cloudinary not configured. Using local static uploads directory.');
      // The frontend uses the API base URL (e.g. http://localhost:4000) for static assets if they start with /uploads
      profileImagePath = `${process.env.API_URL || 'http://localhost:4000'}/uploads/instructors/${req.file.filename}`;
    } else {
      profileImagePath = req.file.path;
    }
  }
  const updatedProfile = await profileService.updateInstructorProfile(req.user.id, req.body, profileImagePath);
  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    data: updatedProfile,
  });
});

/**
 * GET /api/v1/instructor/dashboard
 */
export const getDashboard = asyncHandler(async (req, res) => {
  const stats = await profileService.getInstructorDashboard(req.user.id);
  res.status(200).json({
    success: true,
    data: stats,
  });
});

/**
 * GET /api/v1/instructor/batches
 */
export const getBatches = asyncHandler(async (req, res) => {
  const batches = await profileService.getInstructorBatches(req.user.id);
  res.status(200).json({
    success: true,
    data: batches,
  });
});

/**
 * GET /api/v1/instructor/students/:batchId
 */
export const getStudentBreakdown = asyncHandler(async (req, res) => {
  const breakdown = await profileService.getStudentBreakdown(req.params.batchId);
  res.status(200).json({
    success: true,
    data: breakdown,
  });
});

/**
 * GET /api/v1/instructor/sessions/summary/:sessionId
 */
export const getSessionSummary = asyncHandler(async (req, res) => {
  const summary = await profileService.getSessionSummary(req.params.sessionId);
  res.status(200).json({
    success: true,
    data: summary,
  });
});

/**
 * POST /api/v1/instructor/sessions/:sessionId/assignment
 * Create a standalone assignment for an existing session (after lecture is created).
 */
export const createAssignmentForSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const { assignmentTitle, assignmentDescription, assignmentDeadline, githubRepoSeed } = req.body;

  if (!assignmentTitle) {
    throw new CustomError('Assignment title is required', 400);
  }

  const session = await Session.findById(sessionId);
  if (!session) {
    throw new CustomError('Session not found', 404);
  }

  // Check if assignment already exists for this session
  const existing = await Assignment.findOne({ sessionId: session._id });
  if (existing) {
    throw new CustomError('An assignment already exists for this session. Please edit the session to update it.', 409);
  }

  const assignment = new Assignment({
    title: assignmentTitle,
    sessionId: session._id,
    prompt: assignmentDescription || 'Implement the assignment tasks.',
    submissionDeadline: assignmentDeadline ? new Date(assignmentDeadline) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    attachments: githubRepoSeed || 'No attachments',
    instructions: 'Implement the task as described.',
    task: assignmentTitle,
    createdBy: req.user.id,
  });
  await assignment.save();

  // Sync the session fields so LectureList can read them back
  session.assignmentTitle = assignmentTitle;
  session.assignmentDescription = assignmentDescription || '';
  session.assignmentDeadline = assignment.submissionDeadline;
  if (githubRepoSeed) session.githubRepoSeed = githubRepoSeed;
  await session.save();

  // Notify batch students asynchronously
  notificationService.notifyBatch(
    session.batchId,
    'assignment_published',
    `\ud83d\udcdd A new assignment "${assignmentTitle}" has been published for your batch!`,
    { sessionId: session._id, assignmentId: assignment._id }
  ).catch(err => console.error('[InstructorController] Failed to send assignment notification:', err));

  res.status(201).json({
    success: true,
    message: 'Assignment created and students notified successfully',
    data: assignment,
  });
});


