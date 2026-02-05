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
  _request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  // Multi-device access is allowed. Keep middleware for compatibility.
  return;
}
