import { User, Role, Student, Notification, Session, Assignment, Quiz } from '../models/index.js';
import { reminderQueue } from '../queues/reminderQueue.js';
import nodemailer from 'nodemailer';

let smtpTransporter = null;

function getSmtpTransporter() {
  if (!smtpTransporter) {
    const host = process.env.EMAIL_HOST || 'smtp.gmail.com';
    const port = Number(process.env.EMAIL_PORT) || 587;
    const user = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'imsnexoresha@gmail.com';
    const pass = process.env.EMAIL_PASS;

    if (!pass) return null;

    smtpTransporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });
  }
  return smtpTransporter;
}

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

// Premium HTML Email Template Builder (Glassmorphism Lavender Theme)
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
          background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 50%, #f3e8ff 100%);
          margin: 0;
          padding: 40px 15px;
          color: #3b0764;
        }
        .wrapper {
          max-width: 620px;
          margin: 0 auto;
        }
        .glass-container {
          background: rgba(255, 255, 255, 0.88);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-radius: 24px;
          border: 1px solid rgba(233, 213, 255, 0.9);
          overflow: hidden;
          box-shadow: 0 20px 40px rgba(139, 92, 246, 0.15), 0 8px 16px rgba(168, 85, 247, 0.08);
        }
        .header {
          background: linear-gradient(135deg, #a855f7 0%, #8b5cf6 50%, #7c3aed 100%);
          padding: 32px 24px;
          text-align: center;
          color: #ffffff;
          box-shadow: 0 4px 15px rgba(168, 85, 247, 0.25);
        }
        .header h1 {
          margin: 0;
          font-size: 20px;
          font-weight: 800;
          letter-spacing: 1px;
          text-transform: uppercase;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
        }
        .content {
          padding: 36px 32px;
          color: #3b0764;
          line-height: 1.7;
        }
        .title {
          font-size: 19px;
          font-weight: 800;
          color: #6b21a8;
          margin-bottom: 20px;
          letter-spacing: -0.3px;
        }
        .meta-box {
          background: rgba(243, 232, 255, 0.7);
          border-left: 4px solid #a855f7;
          padding: 16px 20px;
          border-radius: 12px;
          margin: 20px 0;
          font-size: 14px;
          color: #581c87;
        }
        .footer {
          background: rgba(250, 245, 255, 0.9);
          padding: 22px 30px;
          text-align: center;
          font-size: 12px;
          color: #7e22ce;
          border-top: 1px solid #f3e8ff;
        }
        .footer p {
          margin: 4px 0;
        }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="glass-container">
          <div class="header">
            <h1>INTERN MANAGEMENT SYSTEM</h1>
          </div>
          <div class="content">
            <div class="title">${cleanTitle}</div>
            <div style="font-size: 15px; color: #3b0764;">
              ${message}
            </div>
          </div>
          <div class="footer">
            <p><strong>Intern Management System (IMS) Team</strong></p>
            <p>This is an automated notification. Please do not reply directly to this mail.</p>
          </div>
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

  const finalHtml = html.includes('<html') ? html : buildEmailTemplate(subject, html);

  const apiKey = process.env.BREVO_API_KEY || process.env.BREVO_KEY || process.env.BREVO_APIKEY;
  if (!apiKey) {
    const transporter = getSmtpTransporter();
    if (transporter) {
      try {
        const fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'imsnexoresha@gmail.com';
        const info = await transporter.sendMail({
          from: `"IMS Notifications" <${fromEmail}>`,
          to,
          subject,
          html: finalHtml,
        });
        console.log(`[NotificationService] Email sent to ${to} via SMTP: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
      } catch (smtpErr) {
        console.error(`[NotificationService] Error sending email to ${to} via Nodemailer SMTP:`, smtpErr);
        return { success: false, error: smtpErr.message };
      }
    }
    console.warn(`[NotificationService] Skipping email to ${to}: Neither BREVO_API_KEY nor Nodemailer EMAIL_PASS is configured.`);
    return { success: false, error: 'Email transport not configured' };
  }

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
