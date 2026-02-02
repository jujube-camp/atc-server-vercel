import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../utils/prisma.js';

/**
 * Authentication middleware that verifies JWT token and checks session validity
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Verify JWT token (handled by @fastify/jwt)
    await request.jwtVerify();
    
    const decoded = request.user as any;
    const { userId, sessionId } = decoded;

    // If no sessionId in token (old tokens), allow access but log warning
    if (!sessionId) {
      request.server.log.warn(
        { userId },
        '[Authenticate] Token without sessionId detected (legacy token)'
      );
      return;
    }

    // Check if session is still active
    const session = await prisma.authSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || !session.isActive) {
      // Session has been invalidated (user logged in on another device)
      return reply.code(401).send({
        error: 'Session expired',
        code: 'SESSION_INVALIDATED',
        message: 'Your account has been logged in on another device',
      });
    }

    // Update last active time
    await prisma.authSession.update({
      where: { id: sessionId },
      data: { lastActiveAt: new Date() },
    });

  } catch (error) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    });
  }
}

/**
 * Premium device check middleware - ensures premium features are only used on active device
 */
export async function premiumDeviceCheck(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const userId = (request.user as any).userId;
  const deviceId = request.headers['x-device-id'] as string;

  if (!deviceId) {
    return reply.code(400).send({
      error: 'Device ID is required for premium features',
    });
  }

  // Get user's membership
  const membership = await prisma.membership.findUnique({
    where: { userId },
  });

  // If not premium or membership expired, skip device check
  if (!membership || membership.tier === 'FREE' || 
      (membership.expiresAt && membership.expiresAt <= new Date())) {
    return;
  }

  // Get user's active device
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      activeDeviceId: true,
      activeDeviceName: true,
    },
  });

  if (!user) {
    return reply.code(404).send({
      error: 'User not found',
    });
  }

  // Check if current device is the active device
  if (user.activeDeviceId && user.activeDeviceId !== deviceId) {
    return reply.code(403).send({
      error: 'Premium features are currently active on another device',
      activeDevice: user.activeDeviceName || 'Unknown device',
      message: 'Please restore purchases on this device to switch access',
    });
  }
}
