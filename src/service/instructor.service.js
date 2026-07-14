import bcrypt from 'bcrypt';
import User from '../models/user.model.js';
import Instructor from '../models/instructor.model.js';
import Role from '../models/role.model.js';
import { CustomError } from '../../utils/customError.js';

import { Batch } from '../models/index.js';
import * as notificationService from './notificationService.js';

export const createInstructor = async (data) => {
  const {
    name,
    email,
    mobileNo,
    password,
    designation,
    bio,
    linkedInUrl,
    assignedBatches = [],
  } = data;

  const existingEmail = await User.findOne({ email });

  if (existingEmail) {
    throw new CustomError('Email already exists', 409);
  }

  const existingMobile = await User.findOne({ mobileNo });

  if (existingMobile) {
    throw new CustomError('Mobile number already exists', 409);
  }

  let instructorRole = await Role.findOne({ name: 'Instructor' });

  if (!instructorRole) {
    instructorRole = await Role.create({
      name: 'Instructor',
      description: 'Instructor role',
      permissionIds: [],
    });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({
    name,
    email,
    mobileNo,
    password: hashedPassword,
    roleId: instructorRole._id,
    profileStatus: 'Active',
  });

  const instructor = await Instructor.create({
    userId: user._id,
    designation,
    bio,
    linkedInUrl,
    assignedBatches,
  });

  // Assign this instructor to the specified batches
  if (assignedBatches && assignedBatches.length > 0) {
    await Batch.updateMany(
      { _id: { $in: assignedBatches } },
      { $addToSet: { teacherIds: instructor._id } }
    );
  }

  const { password: _, ...safeUser } = user.toObject();

  // Fetch batch names for the email
  const batches = await Batch.find({ _id: { $in: assignedBatches } });
  const batchNames = batches.length > 0 ? batches.map(b => b.name).join(', ') : 'None assigned yet';
  const loginUrl = process.env.CLIENT_URL ? `${process.env.CLIENT_URL}/login` : 'http://localhost:3000/login';

  const emailHtml = `
    <p>Hello <strong>${name}</strong>,</p>
    <p>Your Teacher account has been successfully created by the Administrator.</p>
    <p><strong>Your Assigned Batches:</strong> ${batchNames}</p>
    <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; margin: 20px 0;">
      <p style="margin: 0 0 10px 0;"><strong>Login Credentials:</strong></p>
      <p style="margin: 0 0 5px 0;">Email: ${email}</p>
      <p style="margin: 0;">Password: ${password}</p>
    </div>
    <p>We highly recommend changing your password from your Profile page once you log in.</p>
    <p><a href="${loginUrl}" style="display: inline-block; padding: 12px 24px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 15px;">Click to Login</a></p>
  `;

  // Send Registration Email
  notificationService.sendEmail(email, 'Welcome to IMS - Teacher Account Created', emailHtml)
    .catch(err => console.error('[createInstructor] Failed to send welcome email:', err));

  return {
    user: safeUser,
    instructor,
  };
};

export const getAllInstructors = async () => {
  return Instructor.find().populate({
    path: 'userId',
    select: '-password',
  });
};

export const getInstructorById = async (id) => {
  const instructor = await Instructor.findById(id).populate({
    path: 'userId',
    select: '-password',
  });

  if (!instructor) {
    throw new CustomError('Instructor not found', 404);
  }

  return instructor;
};

export const updateInstructor = async (id, data) => {
  const instructor = await Instructor.findById(id);

  if (!instructor) {
    throw new CustomError('Instructor not found', 404);
  }

  const user = await User.findById(instructor.userId);

  if (!user) {
    throw new CustomError('User not found', 404);
  }

  if (data.email && data.email !== user.email) {
    const existingEmail = await User.findOne({
      email: data.email,
      _id: { $ne: user._id },
    });

    if (existingEmail) {
      throw new CustomError('Email already exists', 409);
    }

    user.email = data.email;
  }

  if (data.mobileNo && data.mobileNo !== user.mobileNo) {
    const existingMobile = await User.findOne({
      mobileNo: data.mobileNo,
      _id: { $ne: user._id },
    });

    if (existingMobile) {
      throw new CustomError('Mobile number already exists', 409);
    }

    user.mobileNo = data.mobileNo;
  }

  if (data.name !== undefined) user.name = data.name;
  if (data.designation !== undefined) instructor.designation = data.designation;
  if (data.bio !== undefined) instructor.bio = data.bio;
  if (data.linkedInUrl !== undefined) instructor.linkedInUrl = data.linkedInUrl;
  if (data.profileImage !== undefined) instructor.profileImage = data.profileImage;

  if (data.assignedBatches !== undefined) {
    if (!Array.isArray(data.assignedBatches)) {
      throw new CustomError('assignedBatches must be an array', 400);
    }

    instructor.assignedBatches = data.assignedBatches;
  }

  await user.save();
  await instructor.save();

  return Instructor.findById(id).populate({
    path: 'userId',
    select: '-password',
  });
};

export const updateInstructorStatus = async (id, active) => {
  const instructor = await Instructor.findById(id);

  if (!instructor) {
    throw new CustomError('Instructor not found', 404);
  }

  const profileStatus = active ? 'Active' : 'Inactive';

  const currentUser = await User.findById(instructor.userId);
  if (!currentUser) {
    throw new CustomError('User not found', 404);
  }
  const oldStatus = currentUser.profileStatus;

  const user = await User.findByIdAndUpdate(
    instructor.userId,
    { profileStatus },
    {
      new: true,
      select: '-password',
    },
  );

  if (oldStatus !== profileStatus && user.email) {
    const subject = `[IMS] Account Status Updated to ${profileStatus}`;
    const message = `<p>Hello ${user.name},</p><p>Your instructor account status has been updated to <strong>${profileStatus}</strong> by the administrator.</p>`;
    notificationService.sendEmail(user.email, subject, message)
      .catch(err => console.error('[InstructorService] Failed to send status update email:', err));
  }

  return user;
};