import {
    User,
    Student,
    Batch,
    BatchConfig,
    Instructor,
    Role,
    StudentMetrics,
} from '../models/index.js';
import { CustomError } from '../../utils/customError.js';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import marksService from './marksService.js';
import auditService from './auditService.js';
import * as notificationService from './notificationService.js';

class AdminService {
    async getOrCreateRole(roleName) {
        let role = await Role.findOne({ name: roleName });

        if (!role) {
            role = await Role.create({
                name: roleName,
                description: `${roleName} role`,
                permissionIds: [],
            });
        }

        return role;
    }

    async createStudent(studentData) {
        const {
            name,
            email,
            password,
            mobileNo,
            batchId,
            enrollementNo,
            dob,
            educationQualification,
            gender,
            instituteName,
        } = studentData;

        if (batchId) {
            const batch = await Batch.findById(batchId);
            if (!batch) {
                throw new CustomError('Batch not found', 404);
            }
        }

        const existingUser = await User.findOne({
            $or: [{ email }, { mobileNo }],
        });

        if (existingUser) {
            throw new CustomError('Email or mobile number already exists', 409);
        }

        const existingStudent = await Student.findOne({ enrollementNo });

        if (existingStudent) {
            throw new CustomError('Enrollment number already exists', 409);
        }

        const studentRole = await this.getOrCreateRole('student');
        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            mobileNo,
            roleId: studentRole._id,
            profileStatus: 'Active',
        });

        const student = await Student.create({
            userId: user._id,
            batchId: batchId || null,
            enrollementNo,
            dob,
            educationQualification,
            gender,
            instituteName,
        });

        if (batchId) {
            const batch = await Batch.findById(batchId);
            if (batch) {
                batch.studentIds.push(student._id);
                await batch.save();
            }
        }

        const { password: _, ...safeUser } = user.toObject();

        const loginUrl = process.env.CLIENT_URL ? `${process.env.CLIENT_URL}/login` : 'http://localhost:3000/login';
        const emailHtml = `
          <p>Hello <strong>${name}</strong>,</p>
          <p>Your Student account has been successfully created by the Administrator.</p>
          <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>Login Credentials:</strong></p>
            <p style="margin: 0 0 5px 0;">Email: ${email}</p>
            <p style="margin: 0;">Password: ${password}</p>
          </div>
          <p>We highly recommend changing your password from your Profile page once you log in.</p>
          <p><a href="${loginUrl}" style="display: inline-block; padding: 12px 24px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 15px;">Click to Login</a></p>
        `;

        notificationService.sendEmail(email, 'Welcome to IMS - Student Account Created', emailHtml)
            .catch(err => console.error('[createStudent] Failed to send welcome email:', err));

        return {
            message: 'Student created successfully',
            user: safeUser,
            student,
        };
    }

    async bulkCreateStudents(studentsData) {
        if (!Array.isArray(studentsData) || studentsData.length === 0) {
            throw new CustomError('students must be a non-empty array', 400);
        }

        const createdStudents = [];
        const errors = [];

        for (let index = 0; index < studentsData.length; index += 1) {
            try {
                const result = await this.createStudent(studentsData[index]);

                createdStudents.push({
                    index,
                    user: result.user,
                    student: result.student,
                });
            } catch (error) {
                errors.push({
                    index,
                    email: studentsData[index]?.email,
                    enrollementNo: studentsData[index]?.enrollementNo,
                    message: error.message,
                });
            }
        }

        return {
            message: 'Bulk student creation completed',
            createdCount: createdStudents.length,
            errorCount: errors.length,
            createdStudents,
            errors,
        };
    }

    async getStudents(query = {}) {
        const { batchId, active } = query;

        const studentFilter = {};
        const userFilter = {};

        if (batchId) {
            studentFilter.batchId = batchId;
        }

        if (active !== undefined) {
            userFilter.profileStatus = active === 'true' ? 'Active' : 'Inactive';
        }

        let students = await Student.find(studentFilter).populate({
            path: 'userId',
            select: '-password',
            match: userFilter,
        });

        if (active !== undefined) {
            students = students.filter((student) => student.userId);
        }

        return {
            message: 'Students fetched successfully',
            students,
        };
    }
    async getStudentById(studentId) {
        const student = await Student.findOne({ _id: studentId }).populate({
            path: 'userId',
            select: '-password',
        });

        if (!student) {
            throw new CustomError('Student not found', 404);
        }

        return {
            message: 'Student fetched successfully',
            student,
        };
    }

    async updateStudent(studentId, studentData) {
        const student = await Student.findOne({ _id: studentId });

        if (!student) {
            throw new CustomError('Student not found', 404);
        }

        const user = await User.findById(student.userId);

        if (!user) {
            throw new CustomError('User not found', 404);
        }

        if (studentData.name) {
            user.name = studentData.name;
        }

        if (studentData.email) {
            const existingUser = await User.findOne({
                email: studentData.email,
                _id: { $ne: user._id },
            });

            if (existingUser) {
                throw new CustomError('Email already exists', 409);
            }

            user.email = studentData.email;
        }

        if (studentData.mobileNo) {
            const existingMobile = await User.findOne({
                mobileNo: studentData.mobileNo,
                _id: { $ne: user._id },
            });

            if (existingMobile) {
                throw new CustomError('Mobile number already exists', 409);
            }

            user.mobileNo = studentData.mobileNo;
        }

        if (studentData.enrollementNo) {
            const existingStudent = await Student.findOne({
                enrollementNo: studentData.enrollementNo,
                _id: { $ne: student._id },
            });

            if (existingStudent) {
                throw new CustomError('Enrollment number already exists', 409);
            }

            student.enrollementNo = studentData.enrollementNo;
        }

        if (studentData.dob !== undefined) student.dob = studentData.dob;
        if (studentData.educationQualification !== undefined) student.educationQualification = studentData.educationQualification;
        if (studentData.gender !== undefined) student.gender = studentData.gender;
        if (studentData.instituteName !== undefined) student.instituteName = studentData.instituteName;
        if (studentData.gitHubUrl !== undefined) student.gitHubUrl = studentData.gitHubUrl;
        if (studentData.linkedInUrl !== undefined) student.linkedInUrl = studentData.linkedInUrl;

        await user.save();
        await student.save();

        return {
            message: 'Student updated successfully',
            student: await Student.findOne({ _id: studentId }).populate({
                path: 'userId',
                select: '-password',
            }),
        };
    }

    async updateStudentStatus(studentId, profileStatus) {
        const student = await Student.findOne({ _id: studentId });

        if (!student) {
            throw new CustomError('Student not found', 404);
        }

        const user = await User.findById(student.userId);

        if (!user) {
            throw new CustomError('User not found', 404);
        }

        const allowedStatus = ['Active', 'Inactive', 'blocked'];

        if (!allowedStatus.includes(profileStatus)) {
            throw new CustomError('Invalid profile status', 400);
        }

        const oldStatus = user.profileStatus;
        user.profileStatus = profileStatus;
        await user.save();

        if (oldStatus !== profileStatus && user.email) {
            const subject = `[IMS] Account Status Updated to ${profileStatus}`;
            const message = `<p>Hello ${user.name},</p><p>Your account status has been updated to <strong>${profileStatus}</strong> by the administrator.</p>`;
            notificationService.sendEmail(user.email, subject, message)
                .catch(err => console.error('[AdminService] Failed to send student status update email:', err));
        }

        return {
            message: `Student ${profileStatus.toLowerCase()} successfully`,
            student: await Student.findOne({ _id: studentId }).populate({
                path: 'userId',
                select: '-password',
            }),
        };
    }

    async moveStudentToBatch(studentId, newBatchId) {
        const student = await Student.findOne({ _id: studentId });

        if (!student) {
            throw new CustomError('Student not found', 404);
        }

        const batch = await Batch.findById(newBatchId);

        if (!batch) {
            throw new CustomError('Batch not found', 404);
        }

        student.batchId = newBatchId;
        await student.save();

        return {
            message: 'Student moved to batch successfully',
            student: await Student.findOne({ _id: studentId }).populate({
                path: 'userId',
                select: '-password',
            }),
        };
    }

    async validateTeachersExist(teacherIds = []) {
        if (!Array.isArray(teacherIds) || teacherIds.length === 0) return;

        const teachers = await Instructor.find({
            _id: { $in: teacherIds },
        });

        if (teachers.length !== teacherIds.length) {
            throw new CustomError('One or more teachers not found', 404);
        }
    }

    async validateStudentsExist(studentIds = []) {
        if (!Array.isArray(studentIds) || studentIds.length === 0) return;

        const students = await Student.find({
            _id: { $in: studentIds },
        });

        if (students.length !== studentIds.length) {
            throw new CustomError('One or more students not found', 404);
        }
    }

    async createBatch(batchData) {
        const {
            name,
            description,
            startDate,
            endDate,
            teacherIds,
            studentIds,
        } = batchData;

        const existingBatch = await Batch.findOne({ name });

        if (existingBatch) {
            throw new CustomError('Batch already exists', 409);
        }

        await this.validateTeachersExist(teacherIds || []);
        await this.validateStudentsExist(studentIds || []);

        const batch = await Batch.create({
            name,
            description: description || '',
            startDate: startDate || null,
            endDate: endDate || null,
            teacherIds: teacherIds || [],
            studentIds: studentIds || [],
        });

        if (teacherIds && teacherIds.length > 0) {
            await Instructor.updateMany(
                { _id: { $in: teacherIds } },
                { $addToSet: { assignedBatches: batch._id } }
            );
        }

        return {
            message: 'Batch created successfully',
            batch,
        };
    }

    async getBatches() {
        const batches = await Batch.find();

        return {
            message: 'Batches fetched successfully',
            batches,
        };
    }

    async getBatchById(batchId) {
        const batch = await Batch.findById(batchId);

        if (!batch) {
            throw new CustomError('Batch not found', 404);
        }

        return {
            message: 'Batch fetched successfully',
            batch,
        };
    }

    async updateBatch(batchId, batchData) {
        const batch = await Batch.findById(batchId);

        if (!batch) {
            throw new CustomError('Batch not found', 404);
        }

        if (batchData.teacherIds !== undefined) {
            await this.validateTeachersExist(batchData.teacherIds);
        }

        if (batchData.studentIds !== undefined) {
            await this.validateStudentsExist(batchData.studentIds);
        }

        if (batchData.name) batch.name = batchData.name;
        if (batchData.description !== undefined) batch.description = batchData.description;
        if (batchData.startDate !== undefined) batch.startDate = batchData.startDate || null;
        if (batchData.endDate !== undefined) batch.endDate = batchData.endDate || null;
        if (batchData.studentIds !== undefined) batch.studentIds = batchData.studentIds;

        if (batchData.teacherIds !== undefined) {
            batch.teacherIds = batchData.teacherIds;

            // Sync instructors' assignedBatches array
            await Instructor.updateMany(
                { assignedBatches: batchId },
                { $pull: { assignedBatches: batchId } }
            );
            
            if (batchData.teacherIds.length > 0) {
                await Instructor.updateMany(
                    { _id: { $in: batchData.teacherIds } },
                    { $addToSet: { assignedBatches: batchId } }
                );
            }
        }

        await batch.save();

        return {
            message: 'Batch updated successfully',
            batch,
        };
    }

    async closeBatch(batchId) {
        const batch = await Batch.findById(batchId);

        if (!batch) {
            throw new CustomError('Batch not found', 404);
        }

        batch.status = 'completed';
        await batch.save();

        return {
            message: 'Batch closed successfully',
            batch,
        };
    }

    async generateRecruiterLink(batchId, adminId) {
        const batch = await Batch.findById(batchId);

        if (!batch) {
            throw new CustomError('Batch not found', 404);
        }

        batch.recruiterUuid = uuidv4();
        batch.recruiterLinkActive = true;

        await batch.save();

        await auditService.createAuditLog({
            adminId,
            actionType: 'RECRUITER_LINK_GENERATED',
            entityType: 'batch',
            entityId: batchId,
            oldValue: null,
            newValue: {
                recruiterUuid: batch.recruiterUuid,
                recruiterLinkActive: true,
            },
            reason: 'Recruiter link generated by admin',
        });

        return {
            message: 'Recruiter link generated successfully',
            recruiterUuid: batch.recruiterUuid,
        };
    }

    async revokeRecruiterLink(batchId, adminId) {
        const batch = await Batch.findById(batchId);

        if (!batch) {
            throw new CustomError('Batch not found', 404);
        }

        const oldValue = {
            recruiterUuid: batch.recruiterUuid,
            recruiterLinkActive: batch.recruiterLinkActive,
        };

        batch.recruiterUuid = null;
        batch.recruiterLinkActive = false;

        await batch.save();

        await auditService.createAuditLog({
            adminId,
            actionType: 'RECRUITER_LINK_REVOKED',
            entityType: 'batch',
            entityId: batchId,
            oldValue,
            newValue: {
                recruiterUuid: null,
                recruiterLinkActive: false,
            },
            reason: 'Recruiter link revoked by admin',
        });

        return {
            message: 'Recruiter link revoked successfully',
        };
    }

    async getBatchConfig(batchId) {
        const batch = await Batch.findById(batchId);

        if (!batch) {
            throw new CustomError('Batch not found', 404);
        }

        let batchConfig = await BatchConfig.findOne({ batchId });

        if (!batchConfig) {
            batchConfig = await BatchConfig.create({ batchId });
        }

        return {
            message: 'Batch config fetched successfully',
            batchConfig,
        };
    }

    async updateBatchConfig(batchId, configData, adminId) {
        const batch = await Batch.findById(batchId);

        if (!batch) {
            throw new CustomError('Batch not found', 404);
        }

        const previousConfig = await BatchConfig.findOne({ batchId }).lean();

        const {
            baseScore,
            attendanceFull,
            attendanceHalf,
            attendanceMissed,
            quizMax,
            quizMissed,
            markCap,
            reason,
        } = configData;

        if (!reason || reason.trim().length < 20) {
            throw new CustomError('Reason must be at least 20 characters', 400);
        }

        const batchConfig = await BatchConfig.findOneAndUpdate(
            { batchId },
            {
                baseScore,
                attendanceFull,
                attendanceHalf,
                attendanceMissed,
                quizMax,
                quizMissed,
                markCap,
                reason,
            },
            {
                new: true,
                upsert: true,
            },
        );

        await auditService.createAuditLog({
            adminId,
            actionType: 'BATCH_CONFIG_UPDATED',
            entityType: 'batch',
            entityId: batchId,
            oldValue: previousConfig,
            newValue: batchConfig,
            reason,
        });

        await marksService.recalculateBatch(batchId, reason, adminId);

        return {
            message: 'Batch config updated successfully',
            batchConfig,
        };
    }

    async getDashboard() {
        const totalStudents = await Student.countDocuments();
        const totalTeachers = await Instructor.countDocuments();
        const totalBatches = await Batch.countDocuments();

        const topMetrics = await StudentMetrics.find()
            .sort({ totalPoints: -1 })
            .limit(5)
            .populate({
                path: 'studentId',
                populate: {
                    path: 'userId',
                    select: 'name email',
                },
            });

        const bottomMetrics = await StudentMetrics.find()
            .sort({ totalPoints: 1 })
            .limit(5)
            .populate({
                path: 'studentId',
                populate: {
                    path: 'userId',
                    select: 'name email',
                },
            });

        return {
            message: 'Dashboard fetched successfully',
            dashboard: {
                totalStudents,
                totalTeachers,
                totalBatches,
                topScorers: topMetrics,
                bottomScorers: bottomMetrics,
            },
        };
    }

    async assignTeachersToBatch(batchId, teacherIds) {
        const batch = await Batch.findById(batchId);

        if (!batch) {
            throw new CustomError('Batch not found', 404);
        }

        if (!Array.isArray(teacherIds)) {
            throw new CustomError('teacherIds must be an array', 400);
        }

        await this.validateTeachersExist(teacherIds);

        batch.teacherIds = teacherIds;
        await batch.save();

        await Instructor.updateMany(
            { _id: { $in: teacherIds } },
            { $addToSet: { assignedBatches: batchId } },
        );

        return {
            message: 'Teachers assigned to batch successfully',
            batch,
        };
    }
}

export default new AdminService();