import { Session, Assignment, Batch, Course, Topic, Instructor, Notification } from '../models/index.js';
import { CustomError } from '../../utils/customError.js';
import * as notificationService from './notificationService.js';

// Helper to parse duration string to milliseconds
function parseDurationToMs(durationStr) {
  if (!durationStr) return 0;
  const num = parseFloat(durationStr);
  if (!isNaN(num)) {
    const lower = durationStr.toLowerCase();
    if (lower.includes('second') || lower.includes('sec')) {
      return num * 1000;
    }
    if (lower.includes('hour')) {
      return num * 60 * 60 * 1000;
    }
    // Default is minutes
    return num * 60 * 1000;
  }
  return 0;
}

async function scheduleSessionJobs(session) {
  if (session.sessionDateAndTime) {
    const now = new Date();
    
    // 1. Schedule auto transition to In Progress at session start time
    const fireStart = new Date(session.sessionDateAndTime);
    if (fireStart > now) {
      try {
        await notificationService.scheduleReminder(session._id, fireStart, 'session_start_auto');
      } catch (err) {
        console.error('[SessionService] Failed to schedule session start auto transition:', err.message);
      }
    }

    // 2. Schedule 24h reminder
    const fire24h = new Date(session.sessionDateAndTime.getTime() - 24 * 60 * 60 * 1000);
    if (fire24h > now) {
      try {
        await notificationService.scheduleReminder(session._id, fire24h, 'lecture_reminder_24h');
      } catch (err) {
        console.error('[SessionService] Failed to schedule 24h reminder:', err.message);
      }
    }

    // 3. Schedule 1h reminder
    const fire1h = new Date(session.sessionDateAndTime.getTime() - 60 * 60 * 1000);
    if (fire1h > now) {
      try {
        await notificationService.scheduleReminder(session._id, fire1h, 'lecture_reminder_1h');
      } catch (err) {
        console.error('[SessionService] Failed to schedule 1h reminder:', err.message);
      }
    }
  }
}

/**
 * Create and schedule a new session.
 */
export async function createSession(sessionData, creatorId) {
  const {
    batchId,
    courseId,
    topicIds,
    title,
    sessionDateAndTime,
    duration,
    startTime,
    endTime,
    half1EndTime,
    meetUrl,
    assignmentTitle,
    assignmentDescription,
    assignmentDeadline,
    githubRepoSeed,
  } = sessionData;

  // Resolve instructor ID from creator's User ID
  const instructor = await Instructor.findOne({ userId: creatorId });
  if (!instructor) {
    throw new CustomError('Instructor profile not found for this user', 404);
  }

  // Verify batch exists
  const batch = await Batch.findById(batchId);
  if (!batch) {
    throw new CustomError('Batch not found', 404);
  }

  // Verify course exists
  const course = await Course.findById(courseId);
  if (!course) {
    throw new CustomError('Course not found', 404);
  }

  // Verify topics exist
  if (topicIds && topicIds.length > 0) {
    const existingTopics = await Topic.find({ _id: { $in: topicIds } });
    if (existingTopics.length !== topicIds.length) {
      throw new CustomError('One or more topic IDs are invalid or not found', 400);
    }
  }

  const session = new Session({
    batchId,
    courseId,
    topicIds,
    title,
    sessionDateAndTime,
    duration,
    startTime,
    endTime,
    half1EndTime,
    meetUrl,
    assignmentTitle,
    assignmentDescription,
    assignmentDeadline,
    githubRepoSeed,
    instructorId: instructor._id,
    createdBy: creatorId,
    status: 'scheduled',
  });

  await session.save();

  // Do not await this, as it will block and timeout if Redis is not installed/running locally
  scheduleSessionJobs(session).catch(err => console.error('[createSession] Redis/Bull error:', err));

  // Send Immediate Broadcast Email & In-App Notification
  const formattedDate = sessionDateAndTime ? new Date(sessionDateAndTime).toLocaleString() : 'TBD';
  let message = `A new lecture "${title}" has been scheduled for ${formattedDate}.`;
  
  if (assignmentTitle) {
    message += `\n\n📝 An assignment "${assignmentTitle}" has also been attached to this lecture!`;
    
    // Auto-create Assignment immediately so it's visible in the UI
    const assignment = new Assignment({
      title: assignmentTitle,
      sessionId: session._id,
      prompt: assignmentDescription || 'Implement the assignment tasks.',
      submissionDeadline: assignmentDeadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      attachments: githubRepoSeed || 'No attachments',
      instructions: 'Implement the task as described.',
      task: assignmentTitle,
      createdBy: creatorId,
    });
    await assignment.save();
    
    notificationService.notifyBatch(batchId, 'assignment_published', `📝 A new assignment "${assignmentTitle}" has been published for your batch!`, {
      sessionId: session._id,
      assignmentId: assignment._id,
    }).catch(err => console.error('[createSession] Failed to send assignment notification:', err));
  }
  
  notificationService.notifyBatch(batchId, 'lecture_scheduled', message, { 
    sessionId: session._id,
    meetingUrl: meetUrl
  }).catch(err => console.error('[createSession] Failed to send broadcast:', err));

  return session;
}

/**
 * Retrieve all sessions for a batch.
 */
export async function getSessionsByBatch(batchId) {
  const batch = await Batch.findById(batchId);
  if (!batch) {
    throw new CustomError('Batch not found', 404);
  }
  const sessions = await Session.find({ batchId }).populate('topicIds');
  return sessions;
}

/**
 * Update session details. Only allowed in 'scheduled' status.
 */
export async function updateSession(sessionId, updateData) {
  const session = await Session.findById(sessionId);
  if (!session) {
    throw new CustomError('Session not found', 404);
  }

  // Check status constraints
  if (session.status !== 'scheduled') {
    throw new CustomError(`Cannot update session: only sessions in 'scheduled' status can be modified`, 400);
  }

  // Verify references if updated
  if (updateData.batchId) {
    const batch = await Batch.findById(updateData.batchId);
    if (!batch) throw new CustomError('Batch not found', 404);
  }
  if (updateData.courseId) {
    const course = await Course.findById(updateData.courseId);
    if (!course) throw new CustomError('Course not found', 404);
  }
  if (updateData.topicIds && updateData.topicIds.length > 0) {
    const existingTopics = await Topic.find({ _id: { $in: updateData.topicIds } });
    if (existingTopics.length !== updateData.topicIds.length) {
      throw new CustomError('One or more topic IDs are invalid or not found', 400);
    }
  }

  const oldTime = session.sessionDateAndTime ? new Date(session.sessionDateAndTime).getTime() : null;
  
  // Track fields changed to see if we should notify
  const relevantFields = ['title', 'sessionDateAndTime', 'duration', 'startTime', 'endTime', 'meetUrl', 'description', 'topicIds'];
  const hasSessionChanges = relevantFields.some(field => {
    if (field === 'topicIds') {
      return JSON.stringify(updateData.topicIds || []) !== JSON.stringify(session.topicIds || []);
    }
    return updateData[field] !== undefined && String(updateData[field]) !== String(session[field]);
  });

  Object.assign(session, updateData);
  await session.save();

  if (updateData.sessionDateAndTime) {
    const newTime = new Date(updateData.sessionDateAndTime).getTime();
    if (newTime !== oldTime) {
      await scheduleSessionJobs(session);
    }
  }

  // Notify batch students about session update
  if (hasSessionChanges) {
    notificationService.notifyBatch(
      session.batchId,
      'session_updated',
      `🔔 The session "${session.title}" has been updated. Please check the lectures section for details.`,
      { sessionId: session._id }
    ).catch(err => console.error('[SessionService] Failed to send session_updated notification:', err));
  }

  // Update existing Assignment if assignment details changed
  if (updateData.assignmentTitle || updateData.assignmentDescription || updateData.assignmentDeadline || updateData.githubRepoSeed) {
    const existingAssignment = await Assignment.findOne({ sessionId: session._id });
    if (existingAssignment) {
      // Check if details actually changed
      const hasAssignmentChanges = 
        (updateData.assignmentTitle && updateData.assignmentTitle !== existingAssignment.title) ||
        (updateData.assignmentDescription && updateData.assignmentDescription !== existingAssignment.prompt) ||
        (updateData.assignmentDeadline && new Date(updateData.assignmentDeadline).getTime() !== new Date(existingAssignment.submissionDeadline).getTime()) ||
        (updateData.githubRepoSeed && updateData.githubRepoSeed !== existingAssignment.attachments);

      if (updateData.assignmentTitle) {
        existingAssignment.title = updateData.assignmentTitle;
        existingAssignment.task = updateData.assignmentTitle;
      }
      if (updateData.assignmentDescription) existingAssignment.prompt = updateData.assignmentDescription;
      if (updateData.assignmentDeadline) existingAssignment.submissionDeadline = updateData.assignmentDeadline;
      if (updateData.githubRepoSeed) existingAssignment.attachments = updateData.githubRepoSeed;
      await existingAssignment.save();

      if (hasAssignmentChanges) {
        notificationService.notifyBatch(
          session.batchId,
          'assignment_updated',
          `📝 The assignment "${existingAssignment.title}" has been updated.`,
          { sessionId: session._id, assignmentId: existingAssignment._id }
        ).catch(err => console.error('[SessionService] Failed to send assignment_updated notification:', err));
      }
    } else if (updateData.assignmentTitle) {
      // Create it if it didn't exist before but they added it via edit
      const assignment = new Assignment({
        title: updateData.assignmentTitle,
        sessionId: session._id,
        prompt: updateData.assignmentDescription || 'Implement the assignment tasks.',
        submissionDeadline: updateData.assignmentDeadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        attachments: updateData.githubRepoSeed || 'No attachments',
        instructions: 'Implement the task as described.',
        task: updateData.assignmentTitle,
        createdBy: session.createdBy,
      });
      await assignment.save();

      // Notify batch students about the newly added assignment
      notificationService.notifyBatch(
        session.batchId,
        'assignment_published',
        `📝 A new assignment "${updateData.assignmentTitle}" has been published for your batch!`,
        { sessionId: session._id, assignmentId: assignment._id }
      ).catch(err => console.error('[SessionService] Failed to send assignment_published notification:', err));
    }

  }

  return session;
}

/**
 * Transition session status using state machine validations.
 */
export async function transitionSessionStatus(sessionId, nextStatus) {
  const session = await Session.findById(sessionId);
  if (!session) {
    throw new CustomError('Session not found', 404);
  }

  const currentStatus = session.status;

  // Define state transitions mapping
  const validTransitions = {
    scheduled: ['In Progress', 'postponed', 'cancelled'],
    postponed: ['scheduled', 'In Progress', 'cancelled'],
    'In Progress': ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
  };

  if (!validTransitions[currentStatus] || !validTransitions[currentStatus].includes(nextStatus)) {
    throw new CustomError(`Invalid status transition from '${currentStatus}' to '${nextStatus}'`, 400);
  }

  // Side effects
  if (nextStatus === 'In Progress') {
    if (session.sessionDateAndTime && Date.now() < new Date(session.sessionDateAndTime).getTime()) {
      throw new CustomError('Session cannot be started before its scheduled start time.', 400);
    }
    session.actualStartTime = new Date();
  } else if (nextStatus === 'completed') {
    if (!session.sessionDateAndTime) {
      throw new CustomError('Cannot complete session: session has no scheduled date and time', 400);
    }
    let expectedEndTime;
    if (session.endTime) {
      const datePart = session.sessionDateAndTime.toISOString().split('T')[0];
      expectedEndTime = new Date(`${datePart}T${session.endTime}:00.000Z`).getTime();
      // Handle midnight wraparound (when lecture runs past midnight UTC)
      if (session.startTime && session.endTime < session.startTime) {
        expectedEndTime += 24 * 60 * 60 * 1000;
      }
    } else {
      const durationMs = parseDurationToMs(session.duration);
      expectedEndTime = session.sessionDateAndTime.getTime() + durationMs;
    }

    if (Date.now() < expectedEndTime) {
      throw new CustomError('Cannot complete session: scheduled duration has not elapsed yet', 400);
    }
  } else if (nextStatus === 'cancelled') {
    await notificationService.notifyBatch(session.batchId, 'session_cancelled', `The session "${session.title}" has been cancelled`, {
      sessionId: session._id,
    });
  } else if (nextStatus === 'postponed') {
    await notificationService.notifyBatch(session.batchId, 'session_postponed', `The session "${session.title}" has been postponed`, {
      sessionId: session._id,
    });
  }

  session.status = nextStatus;
  await session.save();

  if (nextStatus === 'In Progress') {
    const alreadyNotified = await Notification.findOne({
      type: 'lecture_started',
      'meta.sessionId': session._id
    });
    if (!alreadyNotified) {
      try {
        await notificationService.notifyBatch(
          session.batchId,
          'lecture_started',
          `The session "${session.title}" has started.`,
          { sessionId: session._id }
        );
      } catch (err) {
        console.error('[SessionService] Error triggering lecture_started notification:', err.message);
      }
    }
  }

  return session;
}

/**
 * Cancel (soft-delete) a session. Only allowed if status is 'scheduled' or 'postponed'.
 */
export async function deleteSession(sessionId) {
  const session = await Session.findById(sessionId);
  if (!session) {
    throw new CustomError('Session not found', 404);
  }

  if (session.status !== 'scheduled' && session.status !== 'postponed') {
    throw new CustomError("Cannot delete session: only sessions in 'scheduled' or 'postponed' status can be cancelled/deleted", 400);
  }

  session.status = 'cancelled';
  await session.save();

  try {
    await notificationService.notifyBatch(
      session.batchId,
      'session_cancelled',
      `The session "${session.title}" has been cancelled`,
      { sessionId: session._id }
    );
  } catch (err) {
    console.error('[SessionService] Error sending cancellation alerts:', err.message);
  }

  return { success: true };
}
