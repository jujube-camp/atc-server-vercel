import { prisma } from '../utils/prisma.js';
import { verifyAppleToken, extractAppleUserInfo } from '../utils/appleAuth.js';
import { env } from '../config/env.js';
import { AppleSignInInput } from '../schemas/authSchemas.js';

export interface AppleSignInResult {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    username: string | null;
    appleId: string | null;
    avatarUrl: string | null;
    createdAt: Date;
    referralCode: string | null;
    referredByReferralId: string | null;
  };
  token: string;
  isFirstTime: boolean;
}

export class AppleAuthService {
  // Error message for existing email accounts
  private static readonly EMAIL_EXISTS_ERROR = 
    'An account with this email already exists. Please sign in using your email and password. ' +
    'Apple Sign-In cannot be used with existing email accounts.';

  /**
   * Verify and extract Apple user information from identity token
   */
  static async verifyAndExtractAppleUser(identityToken: string): Promise<{
    appleId: string;
    email?: string;
  }> {
    // Verify Apple token
    const tokenPayload = await verifyAppleToken(identityToken, env.APPLE_CLIENT_ID!);
    const appleUserInfo = extractAppleUserInfo(tokenPayload);

    // Validate that we have an Apple user ID (sub)
    if (!appleUserInfo.sub) {
      throw new Error('Invalid Apple token: missing user identifier');
    }

    return {
      appleId: appleUserInfo.sub,
      email: appleUserInfo.email,
    };
  }


  /**
   * Find or create user from Apple Sign-In
   * 
   * Apple Sign-In behavior:
   * - First sign-in: Apple provides email, name (optional), and appleId
   * - Subsequent sign-ins: Apple only provides appleId (no email, no name)
   * 
   * SECURITY: Does NOT automatically link Apple ID to existing email accounts to prevent account takeover
   */
  static async findOrCreateUser(
    appleId: string,
    email: string | undefined,
    displayName: string | null
  ): Promise<{ user: any; isFirstTime: boolean }> {
    // Step 1: Check if user already exists by appleId
    // This handles subsequent sign-ins where Apple only provides appleId
    let existingUser = await prisma.user.findUnique({
      where: { appleId },
    });

    // Step 2: If user not found by appleId, check by email (only on first sign-in when email is provided)
    // SECURITY POLICY: If an email already exists in the database, we do NOT allow Apple ID linking.
    // Users with existing email accounts must always sign in using email/password.
    // This prevents account takeover attacks and maintains clear account ownership.
    if (!existingUser && email) {
      const emailUser = await prisma.user.findUnique({
        where: { email },
      });

      if (emailUser) {
        // Account with this email already exists - do not allow Apple ID linking
        // User must sign in using their email/password credentials
        throw new Error(this.EMAIL_EXISTS_ERROR);
      }
    }

    let user;
    let isFirstTime = false;

    if (existingUser) {
      // Scenario: Subsequent sign-in (user found by appleId)
      // Apple only provided appleId, no email/name on subsequent sign-ins
      // Update displayName only if provided and not already set (rare case)
      if (!existingUser.displayName && displayName) {
        user = await prisma.user.update({
          where: { id: existingUser.id },
          data: { displayName },
        });
      } else {
        user = existingUser;
      }
    } else {
      // Scenario: First sign-in (user not found by appleId)
      // Apple provides email, name (optional), and appleId on first sign-in
      // Email is required for account creation
      if (!email) {
        throw new Error(
          'Email is required for first-time Apple Sign-In. ' +
          'Please ensure you grant email permission during sign-in. ' +
          'Note: Apple only provides email on the first sign-in.'
        );
      }

      try {
        user = await prisma.user.create({
          data: {
            email,
            appleId,
            displayName,
            passwordHash: null, // Apple users don't have passwords
          },
        });
        isFirstTime = true;
      } catch (dbError: any) {
        // Handle race condition: email might have been created between our check and create
        if (dbError.code === 'P2002' && dbError.meta?.target?.includes('email')) {
          const emailUser = await prisma.user.findUnique({
            where: { email },
          });
          
          if (!emailUser) {
            // Unexpected: constraint violation but user not found
            throw dbError;
          }

          // If same Apple ID, it's a race condition - use existing user
          if (emailUser.appleId === appleId) {
            user = emailUser;
            isFirstTime = false;
          } else {
            // Email exists with different or no Apple ID - enforce security policy
            throw new Error(this.EMAIL_EXISTS_ERROR);
          }
        } else {
          throw dbError;
        }
      }
    }

    return { user, isFirstTime };
  }

  /**
   * Process Apple Sign-In request
   * This is the main entry point for Apple Sign-In logic
   * 
   * Apple Sign-In behavior:
   * - First sign-in: Apple provides email, name (optional) in both token and request body
   * - Subsequent sign-ins: Apple only provides appleId in token, no email/name
   */
  static async processAppleSignIn(
    input: AppleSignInInput,
    generateToken: (userId: string, email: string) => string
  ): Promise<AppleSignInResult> {
    // Validate configuration
    if (!env.APPLE_CLIENT_ID) {
      throw new Error('Apple Sign-In is not configured. Please set APPLE_CLIENT_ID environment variable.');
    }

    // Validate identity token
    if (!input.identityToken || input.identityToken.trim() === '') {
      throw new Error('Identity token is required');
    }

    // Verify and extract Apple user information from token
    // Note: Token may contain email on first sign-in, but not on subsequent sign-ins
    const { appleId, email: tokenEmail } = await this.verifyAndExtractAppleUser(input.identityToken);

    // Extract user information from request body (only provided on first sign-in)
    const firstName = input.user?.name?.firstName;
    const lastName = input.user?.name?.lastName;
    const bodyEmail = input.user?.email;
    const displayName = firstName || lastName
      ? [firstName, lastName].filter(Boolean).join(' ')
      : null;

    // Use email from token (first sign-in) or request body (first sign-in fallback)
    // On subsequent sign-ins, email will be undefined, but that's OK - we find user by appleId
    const email = tokenEmail || bodyEmail;

    // Find or create user
    // - If user exists by appleId: login (subsequent sign-in)
    // - If user doesn't exist and email provided: create account (first sign-in)
    // - If user doesn't exist and no email: error (first sign-in without email permission)
    const { user, isFirstTime } = await this.findOrCreateUser(appleId, email, displayName);

    // Generate JWT token
    const token = generateToken(user.id, user.email);

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        username: user.username,
        appleId: user.appleId,
        avatarUrl: (user as any).avatarUrl ?? null,
        createdAt: user.createdAt,
        referralCode: (user as any).referralCode ?? null,
        referredByReferralId: (user as any).referredByReferralId ?? null,
      },
      token,
      isFirstTime,
    };
  }

  /**
   * Verify Apple token (for debugging/testing)
   */
  static async verifyToken(identityToken: string): Promise<{
    valid: boolean;
    payload?: {
      sub: string;
      email?: string;
      emailVerified?: boolean;
    };
    message?: string;
  }> {
    // Validate identityToken is provided
    if (!identityToken || identityToken.trim() === '') {
      return {
        valid: false,
        message: 'Identity token is required',
      };
    }

    // Check if APPLE_CLIENT_ID is configured
    if (!env.APPLE_CLIENT_ID) {
      return {
        valid: false,
        message: 'Apple Sign-In is not configured. Please set APPLE_CLIENT_ID environment variable.',
      };
    }

    try {
      const tokenPayload = await verifyAppleToken(identityToken, env.APPLE_CLIENT_ID);
      const appleUserInfo = extractAppleUserInfo(tokenPayload);

      return {
        valid: true,
        payload: {
          sub: appleUserInfo.sub,
          email: appleUserInfo.email,
          emailVerified: appleUserInfo.emailVerified,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Token verification failed';
      return {
        valid: false,
        message: errorMessage,
      };
    }
  }
}

