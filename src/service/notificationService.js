import { User, Role, Student, Notification, Session, Assignment, Quiz } from '../models/index.js';
import { reminderQueue } from '../queues/reminderQueue.js';

/**
 * Helper to dynamically resolve meeting and target links for sessions, assignments, and quizzes.
 */
async function resolveNotificationLink(type, meta) {
  try {
    const typeLower = type ? type.toLowerCase() : '';
    
    // 1. Assignment
    if (meta?.assignmentId || typeLower.startsWith('assignment_')) {
      return {
        link: '/student/assignments',
        meetingUrl: null,
        label: 'View Assignment'
      };
    }
    
    // 2. Quiz
    if (meta?.quizId || typeLower.startsWith('quiz_') || typeLower === 'quiz') {
      return {
        link: '/student/quiz',
        meetingUrl: null,
        label: 'Take Quiz'
      };
    }

    // 3. Session / Lecture
    if (meta?.sessionId || typeLower.startsWith('session_') || typeLower.startsWith('lecture_')) {
      const sessionId = meta?.sessionId;
      if (sessionId) {
        const session = await Session.findById(sessionId);
        if (session && session.meetUrl) {
          return {
            link: '/student/lectures',
            meetingUrl: session.meetUrl,
            label: 'Join Meeting'
          };
        }
      }
      return {
        link: '/student/lectures',
        meetingUrl: null,
        label: 'View Lectures'
      };
    }

    // 4. Notes / Curriculum
    if (
      typeLower === 'notes_uploaded' ||
      typeLower === 'topic_created' ||
      typeLower === 'topic_updated' ||
      meta?.topicId
    ) {
      return {
        link: meta?.link || '/student/curriculum',
        meetingUrl: null,
        label: 'View Curriculum'
      };
    }
  } catch (error) {
    console.error('[NotificationService] Error resolving notification link:', error);
  }
  return null;
}

/**
 * Saves a notification to the database for a specific user.
 */
export async function createNotification(userId, type, message, meta = {}) {
  if (!userId || !type || !message) {
    throw new Error('Invalid input: userId, type, and message are required.');
  }

  try {
    if (type === 'lecture_started' && meta?.sessionId) {
      const exists = await Notification.findOne({
        userId,
        type: 'lecture_started',
        'meta.sessionId': meta.sessionId
      });
      if (exists) {
        console.log(`[NotificationService] Duplicate lecture_started notification ignored for userId: ${userId}, sessionId: ${meta.sessionId}`);
        return exists;
      }
    }

    const finalMeta = { ...meta };
    const linkInfo = await resolveNotificationLink(type, finalMeta);
    if (linkInfo) {
      if (linkInfo.link) finalMeta.link = linkInfo.link;
      if (linkInfo.meetingUrl) finalMeta.meetingUrl = linkInfo.meetingUrl;
    }

    const notification = new Notification({
      userId,
      type,
      message,
      meta: finalMeta,
    });
    await notification.save();
    return notification;
  } catch (error) {
    console.error(`[NotificationService] Error creating notification for user ${userId}:`, error);
    throw error;
  }
}

// Premium HTML Email Template Builder
function buildEmailTemplate(title, message) {
  const cleanTitle = title.replace(/^\[IMS\]\s*/i, '').replace(/^\[IMS ADMIN ALERT\]\s*/i, '');
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          background-color: #f8fafc;
          margin: 0;
          padding: 0;
        }
        .container {
          max-width: 600px;
          margin: 40px auto;
          background: #ffffff;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 10px 25px rgba(79, 70, 229, 0.05), 0 4px 12px rgba(0, 0, 0, 0.03);
          border: 1px solid #e2e8f0;
        }
        .header {
          background: linear-gradient(135deg, #4f46e5, #6366f1);
          padding: 35px 24px;
          text-align: center;
          color: #ffffff;
        }
        .header h1 {
          margin: 0;
          font-size: 22px;
          font-weight: 700;
          letter-spacing: -0.5px;
          text-transform: uppercase;
        }
        .content {
          padding: 40px 30px;
          color: #334155;
          line-height: 1.65;
        }
        .content p {
          margin: 0 0 20px;
          font-size: 15px;
        }
        .meta-box {
          background-color: #f1f5f9;
          border-left: 4px solid #4f46e5;
          padding: 15px 20px;
          border-radius: 0 8px 8px 0;
          margin: 25px 0 10px;
          font-size: 14px;
          color: #475569;
        }
        .footer {
          background: #f8fafc;
          padding: 24px 30px;
          text-align: center;
          font-size: 12px;
          color: #64748b;
          border-top: 1px solid #e2e8f0;
        }
        .footer p {
          margin: 4px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Intern Management System</h1>
        </div>
        <div class="content">
          <p style="font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 20px;">${cleanTitle}</p>
          <div style="font-size: 15px; color: #334155;">
            ${message}
          </div>
        </div>
        <div class="footer">
          <p><strong>Intern Management System (IMS) Team</strong></p>
          <p>This is an automated notification. Please do not reply directly to this mail.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

let sendEmailMock = null;
export function setSendEmailMock(fn) {
  sendEmailMock = fn;
}

let cachedVerifiedSender = null;

async function getBrevoVerifiedSender(apiKey, preferredEmail) {
  if (cachedVerifiedSender) return cachedVerifiedSender;

  try {
    const res = await fetch('https://api.brevo.com/v3/senders', {
      headers: { 'accept': 'application/json', 'api-key': apiKey },
    });
    if (res.ok) {
      const data = await res.json();
      const senders = data?.senders || [];
      const activeSenders = senders.filter((s) => s.active);
      if (activeSenders.length > 0) {
        const match = activeSenders.find(
          (s) => s.email && preferredEmail && s.email.toLowerCase() === preferredEmail.toLowerCase()
        );
        cachedVerifiedSender = match ? match.email : activeSenders[0].email;
        console.log(`[NotificationService] Using verified Brevo sender: ${cachedVerifiedSender}`);
        return cachedVerifiedSender;
      }
    }
  } catch (err) {
    console.warn('[NotificationService] Could not query Brevo senders list:', err.message);
  }

  cachedVerifiedSender = preferredEmail || 'mohdsaadkhan073@gmail.com';
  return cachedVerifiedSender;
}

/**
 * Sends a transactional email using the Brevo HTTP REST API (v3).
 */
export async function sendEmail(to, subject, html, options = {}) {
  if (sendEmailMock) {
    return sendEmailMock(to, subject, html);
  }
  if (!to || !subject || !html) {
    return { success: false, error: 'Missing recipient, subject, or HTML body.' };
  }

  const apiKey = process.env.BREVO_API_KEY || process.env.BREVO_KEY || process.env.BREVO_APIKEY;
  if (!apiKey) {
    console.warn(`[NotificationService] Skipping email to ${to}: BREVO_API_KEY is not configured in environment variables.`);
    return { success: false, error: 'BREVO_API_KEY missing' };
  }

  const finalHtml = html.includes('<html') ? html : buildEmailTemplate(subject, html);

  // Extract plain text from HTML to heavily improve Inbox delivery rates (reduces Spam flags)
  const plainText = finalHtml
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Format the FROM address properly to improve reputation
  let preferredSender = process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_FROM || process.env.EMAIL_USER;
  let senderName = process.env.BREVO_SENDER_NAME || 'IMS Admin';

  if (options.useTeacherCredentials || options.isTeacherAction) {
    senderName = 'IMS Instructor';
    if (options.from) {
      preferredSender = options.from;
    }
  } else if (options.from) {
    preferredSender = options.from;
  }

  const senderEmail = await getBrevoVerifiedSender(apiKey, preferredSender);

  const payload = {
    sender: {
      name: senderName,
      email: senderEmail,
    },
    to: [
      {
        email: to,
      },
    ],
    subject,
    htmlContent: finalHtml,
    textContent: plainText,
    replyTo: {
      email: options.replyTo || senderEmail,
    },
  };

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify(payload),
    });

    const responseData = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg = responseData?.message || responseData?.code || `Brevo API HTTP ${response.status}`;
      console.error(`[NotificationService] Error sending email to ${to} via Brevo API:`, errorMsg);
      return { success: false, error: errorMsg, statusCode: response.status };
    }

    const messageId = responseData?.messageId || `brevo-${Date.now()}`;
    return { success: true, messageId };
  } catch (error) {
    console.error(`[NotificationService] Exception during Brevo API call for ${to}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Sends an in-app notification and email to all active students in a batch.
 */
export async function notifyBatch(batchId, type, message, meta = {}) {
  if (!batchId || !type || !message) {
    throw new Error('Invalid input: batchId, type, and message are required.');
  }

  try {
    if (type === 'lecture_started' && meta?.sessionId) {
      const exists = await Notification.findOne({
        type: 'lecture_started',
        'meta.sessionId': meta.sessionId
      });
      if (exists) {
        console.log(`[NotificationService] Duplicate lecture_started notification ignored for sessionId: ${meta.sessionId}`);
        return { success: true, count: 0 };
      }
    }

    const finalMeta = { ...meta };
    const linkInfo = await resolveNotificationLink(type, finalMeta);
    if (linkInfo) {
      if (linkInfo.link) finalMeta.link = linkInfo.link;
      if (linkInfo.meetingUrl) finalMeta.meetingUrl = linkInfo.meetingUrl;
    }

    // 1. Fetch students of this batch and populate User detail
    const students = await Student.find({ batchId }).populate('userId');
    
    // Filter for Active students only
    const activeStudents = students.filter(
      (student) => student.userId && student.userId.profileStatus === 'Active'
    );

    if (activeStudents.length === 0) {
      console.log(`[NotificationService] No active students found for batch: ${batchId}`);
      return { success: true, count: 0 };
    }

    // 2. Bulk insert in-app notifications to avoid N+1 database queries
    const notificationsToInsert = activeStudents.map((student) => ({
      userId: student.userId._id,
      type,
      message,
      meta: finalMeta,
    }));
    await Notification.insertMany(notificationsToInsert);

    // 3. Send email notifications asynchronously
    const emailPromises = activeStudents.map((student) => {
      if (student.userId.email) {
        const studentName = student.userId.name || 'Student';
        let emailHtml = `<p>Hello ${studentName},</p><p>${message.replace(/\n/g, '<br/>')}</p>`;
        if (linkInfo) {
          const clientUrl = process.env.CLIENT_URL || 'http://localhost:5174';
          const finalUrl = linkInfo.meetingUrl && linkInfo.meetingUrl.startsWith('http')
            ? linkInfo.meetingUrl
            : `${clientUrl}${linkInfo.link}`;
          emailHtml += `<p><a href="${finalUrl}" style="display: inline-block; padding: 10px 20px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 15px;">${linkInfo.label}</a></p>`;
        }
        
        const isTeacherAction = [
          'lecture_scheduled',
          'lecture_started',
          'session_cancelled',
          'session_postponed',
          'session_updated',
          'notes_uploaded',
          'topic_created',
          'topic_updated',
          'assignment_published',
          'assignment_updated'
        ].includes(type);
        const options = {};
        if (isTeacherAction && process.env.TEACHER_EMAIL && process.env.TEACHER_APP_PASSWORD) {
          options.useTeacherCredentials = true;
          options.from = process.env.TEACHER_EMAIL;
        }

        return sendEmail(
          student.userId.email,
          `[IMS] Notification: ${type.replace(/_/g, ' ').toUpperCase()}`,
          emailHtml,
          options
        );
      }
      return Promise.resolve(null);
    });
    await Promise.all(emailPromises);

    return { success: true, count: activeStudents.length };
  } catch (error) {
    console.error(`[NotificationService] Error notifying batch ${batchId}:`, error);
    throw error;
  }
}

/**
 * Sends an in-app notification and email to all system admins.
 */
export async function notifyAdmins(type, message, meta = {}) {
  if (!type || !message) {
    throw new Error('Invalid input: type and message are required.');
  }

  try {
    // 1. Fetch admin role
    const adminRole = await Role.findOne({ name: { $regex: /^admin$/i } });
    let admins = [];
    if (adminRole) {
      admins = await User.find({ roleId: adminRole._id });
    } else {
      // Fallback: Populate roleId and search
      const allUsers = await User.find().populate('roleId');
      admins = allUsers.filter(
        (u) => u.roleId && u.roleId.name && u.roleId.name.toLowerCase() === 'admin'
      );
    }

    // Ensure we only notify active admins
    const activeAdmins = admins.filter((admin) => admin.profileStatus === 'Active');

    if (activeAdmins.length === 0) {
      console.warn('[NotificationService] No active admins found to notify.');
      return { success: true, count: 0 };
    }

    // 2. Bulk insert in-app notifications
    const notificationsToInsert = activeAdmins.map((admin) => ({
      userId: admin._id,
      type,
      message,
      meta,
    }));
    await Notification.insertMany(notificationsToInsert);

    // 3. Send email alerts to each admin
    const emailPromises = activeAdmins.map((admin) => {
      if (admin.email) {
        return sendEmail(
          admin.email,
          `[IMS ADMIN ALERT] ${type.replace(/_/g, ' ').toUpperCase()}`,
          `<p><strong>Critical Admin Notification:</strong></p><p>${message}</p>`
        );
      }
      return Promise.resolve(null);
    });
    await Promise.all(emailPromises);

    return { success: true, count: activeAdmins.length };
  } catch (error) {
    console.error(`[NotificationService] Error notifying admins:`, error);
    throw error;
  }
}

/**
 * Schedules a delayed Bull job to trigger a notification at a specific time.
 */
export async function scheduleReminder(sessionId, fireAt, type) {
  // 1. Validation Rules
  if (!sessionId) {
    throw new Error('Validation Error: sessionId is required.');
  }

  const validTypes = ['lecture_reminder_24h', 'lecture_reminder_1h', 'assignment_deadline_24h', 'session_start_auto'];
  if (!type || !validTypes.includes(type)) {
    throw new Error(`Validation Error: Invalid reminder type "${type}". Must be one of ${validTypes.join(', ')}.`);
  }

  if (!fireAt) {
    throw new Error('Validation Error: fireAt timestamp is required.');
  }

  const fireTime = new Date(fireAt).getTime();
  if (isNaN(fireTime)) {
    throw new Error('Validation Error: Invalid fireAt date/timestamp.');
  }

  if (fireTime < Date.now()) {
    throw new Error('Validation Error: fireAt timestamp must be in the future.');
  }

  // Verify that the session exists in the database
  const session = await Session.findById(sessionId);
  if (!session) {
    throw new Error(`Validation Error: Session with ID "${sessionId}" not found.`);
  }

  try {
    const delay = fireTime - Date.now();

    // Setup delayed job options with attempts and custom backoff delay strategy
    const jobOptions = {
      delay,
      attempts: 3,
      backoff: {
        type: 'customBackoff',
      },
      jobId: `${sessionId}-${type}-${fireTime}`, // Prevent duplicate scheduling
      removeOnComplete: true,
      removeOnFail: false,
    };

    const job = await reminderQueue.add(
      {
        sessionId,
        type,
        fireAt,
      },
      jobOptions
    );

    console.log(`[NotificationService] Scheduled delayed job: ${job.id} for session: ${sessionId} (type: ${type}, delay: ${delay}ms)`);
    
    return {
      jobId: job.id,
      sessionId,
      type,
      fireAt,
      delay,
    };
  } catch (error) {
    console.error(`[NotificationService] Error scheduling reminder for session ${sessionId}:`, error);
    throw error;
  }
}
