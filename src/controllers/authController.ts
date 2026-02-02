import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../utils/prisma.js';
import crypto from 'crypto';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { 
  RegisterInput, 
  LoginInput,
  AppleSignInInput
} from '../schemas/authSchemas.js';
import { AppleAuthService } from '../services/appleAuthService.js';
import { S3Service } from '../services/s3Service.js';
import { MembershipService } from '../services/membershipService.js';
import { PushNotificationService } from '../services/pushNotificationService.js';

export class AuthController {
  /**
   * Register a new user
   */
  static async register(
    request: FastifyRequest,
    reply: FastifyReply,
    server: any
  ): Promise<void> {
    const { email, password, displayName, username, referralCode, deviceId, deviceName, deviceModel, pushToken } = request.body as RegisterInput;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return reply.code(400).send({
        message: 'User with this email already exists',
      });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    let referredByReferralId: string | undefined;
    if (referralCode) {
      const existingReferral = await (prisma as any).referralCode.findUnique({
        where: { code: referralCode },
      });
      if (existingReferral) {
        referredByReferralId = existingReferral.id as string;
      }
    }

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName,
        username,
        referredByReferralId,
        pushToken,
      },
    });

    // Create auth session
    const authSession = await prisma.authSession.create({
      data: {
        userId: user.id,
        deviceId: deviceId || 'unknown',
        deviceName,
        deviceModel,
        isActive: true,
      },
    });

    // Generate JWT token with session ID
    const token = server.jwt.sign({
      userId: user.id,
      email: user.email,
      sessionId: authSession.id,
    });

    return reply.code(201).send({
      token,
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
        hasCompletedCockpitTour: (user as any).hasCompletedCockpitTour ?? false,
      },
    });
  }

  /**
   * Login an existing user
   */
  static async login(
    request: FastifyRequest,
    reply: FastifyReply,
    server: any
  ): Promise<void> {
    const { email, password, deviceId, deviceName, deviceModel, pushToken } = request.body as LoginInput;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return reply.code(401).send({
        message: 'Invalid email or password',
      });
    }

    // Verify password
    if (!user.passwordHash) {
      return reply.code(401).send({
        message: 'Invalid email or password',
      });
    }

    const isValidPassword = await verifyPassword(password, user.passwordHash);

    if (!isValidPassword) {
      return reply.code(401).send({
        message: 'Invalid email or password',
      });
    }

    // Check if user is a premium member
    const membership = await MembershipService.getMembership(user.id, request.server.log);
    const isPremium = membership.tier !== 'FREE' && MembershipService.isMembershipActive(membership);

    // If premium and has device info, handle device switching
    if (isPremium && deviceId && (user as any).activeDeviceId && (user as any).activeDeviceId !== deviceId) {
      // Deactivate all sessions on the old device
      await prisma.authSession.updateMany({
        where: {
          userId: user.id,
          deviceId: (user as any).activeDeviceId,
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });

      request.server.log.info(
        {
          userId: user.id,
          oldDeviceId: (user as any).activeDeviceId,
          newDeviceId: deviceId,
        },
        '[AuthController] Deactivated sessions on old device due to premium account login on new device'
      );

      // Send push notification to old device
      await PushNotificationService.sendSessionInvalidatedNotification(
        user.id,
        (user as any).activeDeviceId,
        deviceName,
        request.server.log
      );
    }

    // Create new auth session
    const authSession = await prisma.authSession.create({
      data: {
        userId: user.id,
        deviceId: deviceId || 'unknown',
        deviceName,
        deviceModel,
        isActive: true,
      },
    });

    // Update user's active device if premium
    if (isPremium && deviceId) {
      await MembershipService.updateUserActiveDevice(user.id, deviceId, deviceName, request.server.log);
    }

    // Update push token if provided
    if (pushToken) {
      await PushNotificationService.updatePushToken(user.id, pushToken, request.server.log);
    }

    // Generate JWT token with session ID
    const token = server.jwt.sign({
      userId: user.id,
      email: user.email,
      sessionId: authSession.id,
    });

    return reply.code(200).send({
      token,
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
        hasCompletedCockpitTour: (user as any).hasCompletedCockpitTour ?? false,
      },
    });
  }

  /**
   * Get current user info
   */
  static async getCurrentUser(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const userId = (request.user as any).userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return reply.code(404).send({
        message: 'User not found',
      });
    }

    return reply.code(200).send({
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
        hasCompletedCockpitTour: (user as any).hasCompletedCockpitTour ?? false,
      },
    });
  }

  /**
   * Update user display name
   */
  static async updateDisplayName(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const userId = (request.user as any).userId;
    const { displayName } = request.body as { displayName: string };

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return reply.code(404).send({
        message: 'User not found',
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { displayName },
    });

    return reply.code(200).send({
      message: 'Display name updated successfully',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        displayName: updatedUser.displayName,
        username: updatedUser.username,
        appleId: updatedUser.appleId,
        avatarUrl: (updatedUser as any).avatarUrl ?? null,
        createdAt: updatedUser.createdAt,
        referralCode: (updatedUser as any).referralCode ?? null,
        referredByReferralId: (updatedUser as any).referredByReferralId ?? null,
        hasCompletedCockpitTour: (updatedUser as any).hasCompletedCockpitTour ?? false,
      },
    });
  }

  /**
   * Delete user account
   */
  static async deleteAccount(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const userId = (request.user as any).userId;

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return reply.code(404).send({
        message: 'User not found',
      });
    }

    // User is already authenticated via JWT token, no need for password verification
    // Delete user and all related data in the correct order
    
    // 1. Get all sessions for this user
    const sessions = await prisma.session.findMany({
      where: { userId },
      select: { id: true },
    });

    const sessionIds = sessions.map(s => s.id);

    if (sessionIds.length > 0) {
      // 2. Delete evaluations (linked to transmission events)
      // First get all transmission events for these sessions
      // Note: Using type assertion as Prisma types may need rebuild after table creation
      const transmissionEvents = await (prisma as any).transmissionEvent.findMany({
        where: { sessionId: { in: sessionIds } },
        select: { id: true, audio_url: true },
      }) as Array<{ id: string; audio_url?: string | null }>;

      const transmissionEventIds = transmissionEvents.map((e: { id: string }) => e.id);
      const audioFiles = transmissionEvents
        .map((e: { audio_url?: string | null }) => e.audio_url)
        .filter((key): key is string => !!key);

      if (audioFiles.length > 0) {
        await S3Service.deleteAudioBatch(audioFiles, request.server.log);
      }

      if (transmissionEventIds.length > 0) {
        // Delete evaluations linked to these transmission events
        await (prisma as any).evaluation.deleteMany({
          where: { transmissionEventId: { in: transmissionEventIds } },
        });
      }

      // 3. Delete transmission events
      await (prisma as any).transmissionEvent.deleteMany({
        where: { sessionId: { in: sessionIds } },
      });

      // 4. Delete phase advance events
      await (prisma as any).phaseAdvanceEvent.deleteMany({
        where: { sessionId: { in: sessionIds } },
      });

      // 5. Delete sessions
      await prisma.session.deleteMany({
        where: { userId },
      });
    }

    // 6. Delete referral codes owned by this user to satisfy FK constraint
    await (prisma as any).referralCode.deleteMany({
      where: { ownerUserId: userId },
    });

    // 7. Finally delete the user
    await prisma.user.delete({
      where: { id: userId },
    });

    return reply.code(200).send({
      message: 'Account deleted successfully',
    });
  }

  /**
   * Generate or fetch existing referral code for current user
   */
  static async generateReferralCode(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const userId = (request.user as any).userId as string;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return reply.code(404).send({ message: 'User not found' });
    }

    const existingCode = (user as any).referralCode as string | null;
    if (existingCode) {
      return reply.code(200).send({ code: existingCode });
    }

    const code = AuthController.generateBase64Code(8);

    await (prisma as any).referralCode.create({
      data: {
        ownerUserId: userId,
        code,
      },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { referralCode: code },
    });

    return reply.code(201).send({ code });
  }

  /**
   * Validate a referral code exists
   */
  static async validateReferralCode(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const { code } = (request.query as any) as { code?: string };
    if (!code) {
      return reply.code(400).send({ message: 'code is required' });
    }
    const ref = await (prisma as any).referralCode.findUnique({ where: { code } });
    return reply.code(200).send({ exists: !!ref });
  }

  private static generateBase64Code(length: number): string {
    const bytes = crypto.randomBytes(length);
    const base64 = bytes.toString('base64').replace(/[^A-Za-z0-9]/g, '');
    return base64.slice(0, length);
  }

  /**
   * Apple Sign-In
   * Controller handles HTTP request/response, delegates business logic to service
   */
  static async appleSignIn(
    request: FastifyRequest,
    reply: FastifyReply,
    server: any
  ): Promise<void> {
    const input = request.body as AppleSignInInput;
    const { deviceId, deviceName, deviceModel, pushToken } = input;

    try {
      // Delegate business logic to service
      const result = await AppleAuthService.processAppleSignIn(
        input,
        (userId: string, email: string) => {
          return server.jwt.sign({
            userId,
            email,
          });
        }
      );

      // Get user to check membership status
      const user = await prisma.user.findUnique({
        where: { id: result.user.id },
      });

      if (!user) {
        return reply.code(404).send({
          message: 'User not found',
        });
      }

      // Check if user is a premium member
      const membership = await MembershipService.getMembership(user.id, request.server.log);
      const isPremium = membership.tier !== 'FREE' && MembershipService.isMembershipActive(membership);

      // If premium and has device info, handle device switching
      if (isPremium && deviceId && (user as any).activeDeviceId && (user as any).activeDeviceId !== deviceId) {
        // Deactivate all sessions on the old device
        await prisma.authSession.updateMany({
          where: {
            userId: user.id,
            deviceId: (user as any).activeDeviceId,
            isActive: true,
          },
          data: {
            isActive: false,
          },
        });

        request.server.log.info(
          {
            userId: user.id,
            oldDeviceId: (user as any).activeDeviceId,
            newDeviceId: deviceId,
          },
          '[AuthController] Deactivated sessions on old device due to premium account Apple Sign-In on new device'
        );

        // Send push notification to old device
        await PushNotificationService.sendSessionInvalidatedNotification(
          user.id,
          (user as any).activeDeviceId,
          deviceName,
          request.server.log
        );
      }

      // Create auth session
      const authSession = await prisma.authSession.create({
        data: {
          userId: user.id,
          deviceId: deviceId || 'unknown',
          deviceName,
          deviceModel,
          isActive: true,
        },
      });

      // Update user's active device if premium
      if (isPremium && deviceId) {
        await MembershipService.updateUserActiveDevice(user.id, deviceId, deviceName, request.server.log);
      }

      // Update push token if provided
      if (pushToken) {
        await PushNotificationService.updatePushToken(user.id, pushToken, request.server.log);
      }

      // Generate JWT token with session ID
      const token = server.jwt.sign({
        userId: user.id,
        email: user.email,
        sessionId: authSession.id,
      });

      return reply.code(200).send({
        token,
        user: result.user,
        isFirstTime: result.isFirstTime,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Apple Sign-In failed';
      server.log.error(
        { 
          error: errorMessage, 
          stack: error instanceof Error ? error.stack : undefined 
        }, 
        'Apple Sign-In error'
      );
      
      // Determine appropriate status code based on error type
      let statusCode = 401;
      if (errorMessage.includes('not configured') || errorMessage.includes('APPLE_CLIENT_ID')) {
        statusCode = 500;
      } else if (
        errorMessage.includes('required') || 
        errorMessage.includes('invalid') ||
        errorMessage.includes('already exists') ||
        errorMessage.includes('Please login')
      ) {
        // 409 Conflict for account already exists, 400 for other validation errors
        statusCode = errorMessage.includes('already exists') ? 409 : 400;
      }
      
      return reply.code(statusCode).send({
        message: errorMessage,
      });
    }
  }

  /**
   * Verify Apple token (for debugging/testing)
   * Controller handles HTTP request/response, delegates business logic to service
   */
  static async verifyAppleTokenEndpoint(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const { identityToken } = request.body as { identityToken: string };

    try {
      const result = await AppleAuthService.verifyToken(identityToken);

      if (result.valid) {
        return reply.code(200).send({
          valid: true,
          payload: result.payload,
        });
      } else {
        // Determine status code based on error type
        const statusCode = result.message?.includes('not configured') || 
                          result.message?.includes('APPLE_CLIENT_ID') ? 500 : 400;
        
        return reply.code(statusCode).send({
          valid: false,
          message: result.message,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Token verification failed';
      
      return reply.code(400).send({
        valid: false,
        message: errorMessage,
      });
    }
  }

  /**
   * Mark cockpit tour as completed
   */
  static async completeCockpitTour(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const userId = (request.user as any).userId;

    try {
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { hasCompletedCockpitTour: true },
      });

      return reply.code(200).send({
        message: 'Cockpit tour marked as completed',
        hasCompletedCockpitTour: (updatedUser as any).hasCompletedCockpitTour,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update cockpit tour status';
      return reply.code(500).send({
        message: errorMessage,
      });
    }
  }

  /**
   * Update push token
   */
  static async updatePushToken(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const userId = (request.user as any).userId;
    const { pushToken } = request.body as { pushToken: string | null };

    try {
      await PushNotificationService.updatePushToken(userId, pushToken, request.server.log);

      return reply.code(200).send({
        message: 'Push token updated successfully',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update push token';
      return reply.code(500).send({
        message: errorMessage,
      });
    }
  }

  /**
   * Upload user avatar
   */
  static async uploadAvatar(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const userId = (request.user as any).userId;

    try {
      const data = await request.file();
      
      if (!data) {
        return reply.code(400).send({
          message: 'No file uploaded',
        });
      }

      // Validate file type
      const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!allowedMimeTypes.includes(data.mimetype)) {
        return reply.code(400).send({
          message: 'Invalid file type. Only JPEG, PNG, and WebP images are allowed.',
        });
      }

      // Validate file size (max 5MB)
      const maxSize = 5 * 1024 * 1024; // 5MB
      const buffer = await data.toBuffer();
      if (buffer.length > maxSize) {
        return reply.code(400).send({
          message: 'File too large. Maximum size is 5MB.',
        });
      }

      // Convert image to base64
      const base64Image = buffer.toString('base64');
      const dataUri = `data:${data.mimetype};base64,${base64Image}`;

      // Update user avatar in database
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { avatarUrl: dataUri },
      });

      return reply.code(200).send({
        message: 'Avatar uploaded successfully',
        avatarUrl: (updatedUser as any).avatarUrl,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload avatar';
      return reply.code(500).send({
        message: errorMessage,
      });
    }
  }
}
