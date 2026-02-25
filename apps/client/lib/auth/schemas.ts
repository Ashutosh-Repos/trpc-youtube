import { z } from "zod";

// Password complexity regex: at least 1 uppercase, 1 lowercase, 1 number, 1 special char
const passwordRegex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
const passwordComplexityMessage =
    "Password must contain uppercase, lowercase, number, and special character (@$!%*?&)";

export const loginSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(1, "Password is required"),
});

export const registerSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .regex(passwordRegex, passwordComplexityMessage),
    name: z.string().min(2, "Name must be at least 2 characters"),
});

export const requestResetSchema = z.object({ email: z.string().email() });

export const resetPasswordSchema = z.object({
    token: z.string(),
    newPassword: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .regex(passwordRegex, passwordComplexityMessage),
});

export const changePasswordSchema = z.object({
    currentPassword: z.string(),
    newPassword: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .regex(passwordRegex, passwordComplexityMessage),
});
