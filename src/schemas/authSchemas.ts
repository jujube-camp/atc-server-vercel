import { z } from 'zod';

/**
 * User registration request schema
 */
export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().min(1).max(100).optional(),
  username: z.string().min(3, 'Username must be at least 3 characters').max(20, 'Username must be at most 20 characters').regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores').optional(),
  referralCode: z.string().min(6).max(12).optional(),
  deviceId: z.string().optional(),
  deviceName: z.string().optional(),
  deviceModel: z.string().optional(),
  pushToken: z.string().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * User login request schema
 */
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  deviceId: z.string().optional(),
  deviceName: z.string().optional(),
  deviceModel: z.string().optional(),
  pushToken: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Apple Sign-In request schema
 */
export const appleSignInSchema = z.object({
  identityToken: z.string().min(1, 'Identity token is required'),
  user: z.object({
    email: z.string().email().optional(),
    name: z.object({
      firstName: z.string().optional(),
      lastName: z.string().optional(),
    }).optional(),
  }).optional(),
  deviceId: z.string().optional(),
  deviceName: z.string().optional(),
  deviceModel: z.string().optional(),
  pushToken: z.string().optional(),
});

export type AppleSignInInput = z.infer<typeof appleSignInSchema>;

/**
 * Apple token verification schema
 */
export const appleVerifySchema = z.object({
  identityToken: z.string().min(1, 'Identity token is required'),
});

export type AppleVerifyInput = z.infer<typeof appleVerifySchema>;

/**
 * User response schema (exclude sensitive data)
 */
export const userResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string().nullable(),
  username: z.string().nullable(),
  appleId: z.string().nullable(),
  avatarUrl: z.string().nullable().optional(),
  createdAt: z.date(),
  referralCode: z.string().nullable().optional(),
  referredByReferralId: z.string().nullable().optional(),
  hasCompletedCockpitTour: z.boolean().optional(),
});

export type UserResponse = z.infer<typeof userResponseSchema>;

/**
 * Auth response schema (includes token)
 */
export const authResponseSchema = z.object({
  token: z.string(),
  user: userResponseSchema,
  isFirstTime: z.boolean().optional(),
});

export type AuthResponse = z.infer<typeof authResponseSchema>;

/**
 * Delete account request schema
 */
export const deleteAccountSchema = z.object({
  // No fields required - user is authenticated via JWT token
});

export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

/**
 * Get current user response schema
 */
export const getCurrentUserResponseSchema = z.object({
  user: userResponseSchema,
});

export type GetCurrentUserResponse = z.infer<typeof getCurrentUserResponseSchema>;

/**
 * Error response schema
 */
export const errorResponseSchema = z.object({
  message: z.string(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

/**
 * Refresh token request schema
 */
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

/**
 * Refresh token response schema
 */
export const refreshTokenResponseSchema = z.object({
  token: z.string(),
  refreshToken: z.string(),
  user: userResponseSchema,
});
/**
 * Referral code: generate response
 */
export const referralGenerateResponseSchema = z.object({
  code: z.string(),
});

export type ReferralGenerateResponse = z.infer<typeof referralGenerateResponseSchema>;

/**
 * Referral code: validate response
 */
export const referralValidateResponseSchema = z.object({
  exists: z.boolean(),
});

export type ReferralValidateResponse = z.infer<typeof referralValidateResponseSchema>;

/**
 * Update user display name request schema
 */
export const updateDisplayNameSchema = z.object({
  displayName: z.string().min(1, 'Display name is required').max(100, 'Display name must be at most 100 characters'),
});

export type UpdateDisplayNameInput = z.infer<typeof updateDisplayNameSchema>;

/**
 * Update user display name response schema
 */
export const updateDisplayNameResponseSchema = z.object({
  message: z.string(),
  user: userResponseSchema,
});

export type UpdateDisplayNameResponse = z.infer<typeof updateDisplayNameResponseSchema>;

export type RefreshTokenResponse = z.infer<typeof refreshTokenResponseSchema>;

