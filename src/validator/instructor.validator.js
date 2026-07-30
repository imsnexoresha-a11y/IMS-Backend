import { CustomError } from "../../utils/customError.js";

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidIndianMobile(mobileNo) {
  if (!mobileNo) return false;
  return /^[6-9]\d{9}$/.test(String(mobileNo).trim());
}

export const validateCreateInstructor = (req, _res, next) => {
  const { name, email, mobileNo, password, designation } = req.body;

  if (!name) {
    throw new CustomError("Name is required", 400);
  }

  if (!email) {
    throw new CustomError("Email is required", 400);
  }

  if (!isValidEmail(email)) {
    throw new CustomError("Invalid email format", 400);
  }

  if (!mobileNo) {
    throw new CustomError("Mobile number is required", 400);
  }

  if (!isValidIndianMobile(mobileNo)) {
    throw new CustomError("Mobile number must be a valid 10-digit Indian number starting with 6, 7, 8, or 9", 400);
  }

  if (!password) {
    throw new CustomError("Password is required", 400);
  }

  if (password.length < 6) {
    throw new CustomError("Password must be at least 6 characters", 400);
  }

  if (!designation) {
    throw new CustomError("Designation is required", 400);
  }

  next();
};

export const validateUpdateInstructor = (req, _res, next) => {
  const { mobileNo } = req.body;

  if (mobileNo !== undefined) {
    if (!mobileNo || !isValidIndianMobile(mobileNo)) {
      throw new CustomError("Mobile number must be a valid 10-digit Indian number starting with 6, 7, 8, or 9", 400);
    }
  }

  next();
};

export const validateInstructorStatus = (req, _res, next) => {
  const { active } = req.body;

  if (typeof active !== "boolean") {
    throw new CustomError("Active must be true or false", 400);
  }

  next();
};