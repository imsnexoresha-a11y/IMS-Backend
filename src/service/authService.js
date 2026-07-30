import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { User } from '../models/index.js';
import { CustomError } from '../../utils/customError.js';

function signAccessToken(user, roleName) {
    return jwt.sign(
        {
            id: user._id,
            email: user.email,
            role: roleName,
            tokenVersion: user.tokenVersion,
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
    );
}

function signRefreshToken(user) {
    return jwt.sign(
        {
            id: user._id,
            tokenVersion: user.tokenVersion,
            type: 'refresh',
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' },
    );
}

async function login({ email, password }) {
    if (!email || !password) {
        throw new CustomError('Email and password are required', 400);
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail }).populate('roleId');

    if (!user) {
        throw new CustomError('Invalid email or password', 401);
    }

    if (user.profileStatus !== 'Active') {
        throw new CustomError('User account is not active', 403);
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
        throw new CustomError('Invalid email or password', 401);
    }

    const roleName = user.roleId?.name;

    return {
        message: 'Login successful',
        accessToken: signAccessToken(user, roleName),
        refreshToken: signRefreshToken(user),
        user: {
            id: user._id,
            name: user.name,
            role: roleName,
            email: user.email,
        },
    };
}

async function logout(userId) {
    await User.findOneAndUpdate(
        { _id: userId },
        { $inc: { tokenVersion: 1 } },
    );

    return {
        message: 'Logout successful',
    };
}

async function refresh(refreshToken) {
    if (!refreshToken) {
        throw new CustomError('Refresh token is required', 400);
    }

    let decoded;

    try {
        decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    } catch (_error) {
        throw new CustomError('Invalid or expired refresh token', 401);
    }

    if (decoded.type !== 'refresh') {
        throw new CustomError('Invalid refresh token', 401);
    }

    const user = await User.findOne({ _id: decoded.id }).populate('roleId');

    if (!user || user.deletedAt) {
        throw new CustomError('User not found', 401);
    }

    if (user.profileStatus !== 'Active') {
        throw new CustomError('User account is not active', 403);
    }

    if (decoded.tokenVersion !== user.tokenVersion) {
        throw new CustomError('Refresh token expired. Please login again.', 401);
    }

    const roleName = user.roleId?.name;

    return {
        message: 'Token refreshed successfully',
        accessToken: signAccessToken(user, roleName),
        refreshToken: signRefreshToken(user),
    };
}

async function changePassword(userId, { currentPassword, newPassword, otp }) {
    if (!currentPassword || !newPassword || !otp) {
        throw new CustomError('currentPassword, newPassword, and otp are required', 400);
    }

    if (newPassword.length < 6) {
        throw new CustomError('New password must be at least 6 characters', 400);
    }

    const user = await User.findOne({ _id: userId });

    if (!user) {
        throw new CustomError('User not found', 404);
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);

    if (!isPasswordValid) {
        throw new CustomError('Current password is incorrect', 400);
    }

    // Verify OTP (case-insensitive email matching)
    const { Otp } = await import('../models/index.js');
    const normalizedUserEmail = user.email.toLowerCase().trim();
    const cleanOtp = String(otp).trim();

    const record = await Otp.findOne({ 
      email: { $regex: new RegExp(`^${normalizedUserEmail}$`, 'i') }, 
      otp: cleanOtp, 
      type: 'change_password', 
      expiresAt: { $gt: new Date() } 
    });

    if (!record) {
        throw new CustomError('Invalid or expired OTP', 400);
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.passwordChangedAt = new Date();
    user.tokenVersion += 1;

    await user.save();
    
    await Otp.deleteMany({ email: { $regex: new RegExp(`^${normalizedUserEmail}$`, 'i') }, type: 'change_password' }); // clear OTPs

    // Send confirmation email
    const { sendEmail } = await import('./notificationService.js');
    await sendEmail(
        user.email, 
        'Password Changed Successfully', 
        `<p>Hello ${user.name},</p><p>Your password was successfully updated via your Profile. If you did not make this change, please contact support immediately.</p>`
    );

    return {
        message: 'Password changed successfully',
    };
}

async function sendOtp({ email, type = 'forgot_password' }) {
    if (!email) throw new CustomError('Email is required', 400);
    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') } });
    if (!user) {
        // Return generic success to prevent email enumeration
        return { message: 'If that email exists, an OTP has been sent.' };
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit OTP

    const { Otp } = await import('../models/index.js');
    await Otp.deleteMany({ email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') }, type }); // Clear old OTPs
    await Otp.create({
        email: normalizedEmail,
        otp,
        type,
        expiresAt: new Date(Date.now() + 10 * 60000) // 10 mins
    });

    const { sendEmail } = await import('./notificationService.js');
    const emailHtml = `
      <p>Hello <strong>${user.name}</strong>,</p>
      <p>Your One-Time Password (OTP) for <strong>${type.replace('_', ' ')}</strong> is:</p>
      <div style="background: linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%); border: 1px solid rgba(192, 132, 252, 0.4); padding: 20px; border-radius: 16px; text-align: center; margin: 20px 0; box-shadow: inset 0 2px 4px rgba(255, 255, 255, 0.8), 0 4px 12px rgba(168, 85, 247, 0.15);">
        <span style="font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #7e22ce;">
          ${otp}
        </span>
      </div>
      <p style="color: #6b21a8; font-size: 13px;">This code will expire in 10 minutes. Do not share it with anyone.</p>
    `;

    await sendEmail(user.email, 'Your OTP Code', emailHtml);
    return { message: 'OTP sent successfully' };
}

async function verifyOtp({ email, otp, type = 'forgot_password' }) {
    if (!email || !otp) throw new CustomError('Email and OTP are required', 400);

    const normalizedEmail = email.toLowerCase().trim();
    const cleanOtp = String(otp).trim();

    const { Otp } = await import('../models/index.js');
    const record = await Otp.findOne({ 
      email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') }, 
      otp: cleanOtp, 
      type, 
      expiresAt: { $gt: new Date() } 
    });

    if (!record) {
        throw new CustomError('Invalid or expired OTP', 400);
    }
    
    const user = await User.findOne({ email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') } }).populate('roleId');

    if (!user) {
        throw new CustomError('User not found', 404);
    }

    if (user.profileStatus !== 'Active') {
        throw new CustomError('User account is not active', 403);
    }

    const roleName = user.roleId?.name;

    return {
        message: 'OTP verified successfully, logging in...',
        accessToken: signAccessToken(user, roleName),
        refreshToken: signRefreshToken(user),
        user: {
            id: user._id,
            email: user.email,
            name: user.name,
            role: roleName,
            avatar: user.profilePic || null,
        },
    };
}

async function resetPassword({ email, otp, newPassword, type = 'forgot_password' }) {
    if (!email || !otp || !newPassword) {
        throw new CustomError('Email, OTP, and newPassword are required', 400);
    }
    
    if (newPassword.length < 6) {
        throw new CustomError('New password must be at least 6 characters', 400);
    }

    const normalizedEmail = email.toLowerCase().trim();
    const cleanOtp = String(otp).trim();

    const { Otp } = await import('../models/index.js');
    const record = await Otp.findOne({ 
      email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') }, 
      otp: cleanOtp, 
      type, 
      expiresAt: { $gt: new Date() } 
    });

    if (!record) {
        throw new CustomError('Invalid or expired OTP', 400);
    }

    const user = await User.findOne({ email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') } });
    if (!user) throw new CustomError('User not found', 404);

    user.password = await bcrypt.hash(newPassword, 10);
    user.passwordChangedAt = new Date();
    user.tokenVersion += 1;
    await user.save();

    await Otp.deleteMany({ email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') }, type }); // clear OTPs

    const { sendEmail } = await import('./notificationService.js');
    await sendEmail(
        user.email, 
        'Password Changed Successfully', 
        `<p>Hello ${user.name},</p><p>Your password has been changed successfully. If you did not do this, please contact support immediately.</p>`
    );

    return { message: 'Password reset successfully' };
}

export default {
    login,
    logout,
    refresh,
    changePassword,
    sendOtp,
    verifyOtp,
    resetPassword
};