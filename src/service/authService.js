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

    // Verify OTP
    const { Otp } = await import('../models/index.js');
    const record = await Otp.findOne({ email: user.email, otp, type: 'change_password', expiresAt: { $gt: new Date() } });

    if (!record) {
        throw new CustomError('Invalid or expired OTP', 400);
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.passwordChangedAt = new Date();
    user.tokenVersion += 1;

    await user.save();

    await Otp.deleteMany({ email: user.email, type: 'change_password' }); // clear OTPs

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


async function sendOtp({
    email,
    type = 'forgot_password',
}) {
    if (!email) {
        throw new CustomError(
            'Email is required',
            400
        );
    }

    const normalizedEmail =
        email.toLowerCase().trim();

    const allowedTypes = [
        'forgot_password',
        'change_password',
    ];

    if (!allowedTypes.includes(type)) {
        throw new CustomError(
            'Invalid OTP type',
            400
        );
    }

    const user = await User.findOne({
        email: normalizedEmail,
    });

    if (!user) {
        return {
            message:
                'If that email exists, an OTP has been sent.',
        };
    }

    const otp = Math.floor(
        100000 + Math.random() * 900000
    ).toString();

    const { Otp } = await import(
        '../models/index.js'
    );

    await Otp.deleteMany({
        email: normalizedEmail,
        type,
    });

    const otpRecord = await Otp.create({
        email: normalizedEmail,
        otp,
        type,
        expiresAt: new Date(
            Date.now() + 10 * 60 * 1000
        ),
    });

    const { sendEmail } = await import(
        './notificationService.js'
    );

    const emailHtml = `
        <p>Hello ${user.name},</p>
        <p>Your One-Time Password (OTP) for ${type.replace(
        /_/g,
        ' '
    )} is:</p>

        <h2 style="
            background: #f1f5f9;
            padding: 15px;
            border-radius: 8px;
            letter-spacing: 5px;
            font-weight: bold;
            text-align: center;
            color: #4f46e5;
        ">
            ${otp}
        </h2>

        <p>
            This code will expire in 10 minutes.
            Do not share it with anyone.
        </p>
    `;

    const emailResult = await sendEmail(
        normalizedEmail,
        'Your OTP Code',
        emailHtml
    );

    if (!emailResult?.success) {
        await Otp.deleteOne({
            _id: otpRecord._id,
        });

        throw new CustomError(
            emailResult?.error ||
            'Unable to send OTP email',
            500
        );
    }

    return {
        message: 'OTP sent successfully',
    };
}



async function verifyOtp({ email, otp, type = 'forgot_password' }) {
    if (!email || !otp) throw new CustomError('Email and OTP are required', 400);

    const { Otp } = await import('../models/index.js');
    const record = await Otp.findOne({ email, otp, type, expiresAt: { $gt: new Date() } });

    if (!record) {
        throw new CustomError('Invalid or expired OTP', 400);
    }

    // Log the user in with the OTP!
    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail }).populate('roleId');

    if (!user) {
        throw new CustomError('User not found', 404);
    }

    if (user.profileStatus !== 'Active') {
        throw new CustomError('User account is not active', 403);
    }

    // Delete OTP record since it's used
    await Otp.deleteOne({ _id: record._id });

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

    const { Otp } = await import('../models/index.js');
    const record = await Otp.findOne({ email, otp, type, expiresAt: { $gt: new Date() } });

    if (!record) {
        throw new CustomError('Invalid or expired OTP', 400);
    }

    const user = await User.findOne({ email });
    if (!user) throw new CustomError('User not found', 404);

    user.password = await bcrypt.hash(newPassword, 10);
    user.passwordChangedAt = new Date();
    user.tokenVersion += 1;
    await user.save();

    await Otp.deleteMany({ email, type }); // clear OTPs

    const { sendEmail } = await import('./notificationService.js');
    await sendEmail(
        email,
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