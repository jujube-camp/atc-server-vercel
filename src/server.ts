import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { serializerCompiler, validatorCompiler, ZodTypeProvider, hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { env } from './config/env.js';
import { prisma } from './utils/prisma.js';
import authRoutes from './routes/auth.js';
import sessionRoutes from './routes/sessions.js';
import eventRoutes from './routes/event-routes.js';
import evaluationRoutes from './routes/evaluation-routes.js';
import airportRoutes from './routes/airports.js';
import ttsRoutes from './routes/tts-routes.js';
import liveatcRoutes from './routes/liveatc-routes.js';
import feedbackRoutes from './routes/feedback-routes.js';
import recordingRoutes from './routes/recording-routes.js';
import trainingModeRoutes from './routes/training-modes.js';
import aircraftTypeRoutes from './routes/aircraft-types.js';
import membershipRoutes from './routes/membership-routes.js';
import appleWebhookRoutes from './routes/apple-webhook-routes.js';
import versionRoutes from './routes/version-routes.js';
import clientLogRoutes from './routes/client-log-routes.js';

// Extend Fastify types for JWT
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: any;
    optionalAuthenticate: any;
  }
}

/**
 * Build and configure the Fastify server
 */
async function buildServer() {
  // Never use pino-pretty on Vercel/serverless (transport fails; pino-pretty not available)
  const usePrettyLogger = env.NODE_ENV === 'development' && env.VERCEL !== '1';
  const server = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport: usePrettyLogger ? {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      } : undefined,
    },
    disableRequestLogging: true, // Disable automatic "incoming request" logs
    bodyLimit: 4 * 1024 * 1024, // 4MB to stay under Vercel's 4.5MB limit (client enforces <90s audio)
  }).withTypeProvider<ZodTypeProvider>();

  // Set up Zod validation
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  // Register plugins
  await server.register(helmet);
  // Allow CORS from Expo/mobile (origin may be null or custom scheme); on Vercel accept requests so app can connect
  const allowCors = env.NODE_ENV === 'development' || env.VERCEL === '1';
  await server.register(cors, {
    origin: allowCors ? true : false, // true = reflect request origin (allows mobile app)
  });
  await server.register(rateLimit, {
    max: 5000,
    timeWindow: '1 minute',
  });

  // Register JWT
  await server.register(jwt, {
    secret: env.JWT_SECRET,
    sign: {
      expiresIn: '28d', // 24 hours (or '7d' for 7 days)
    },
  });

  // Authentication decorator - Verify JWT and extract user
  server.decorate('authenticate', async function (request: any, reply: any) {
    try {
      // Skip authentication for OPTIONS preflight requests
      if (request.method === 'OPTIONS') {
        return;
      }
      
      // For WebSocket connections, React Native cannot send Authorization header
      // So we also check query parameter for token
      let token: string | undefined;
      
      // First try to get token from Authorization header
      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
      
      // If no token in header, try query parameter (for WebSocket)
      if (!token) {
        const query = request.query as { token?: string };
        token = query?.token;
      }
      
      if (!token) {
        throw new Error('Missing authentication token');
      }
      
      // Verify JWT token
      // Manually verify since we're getting token from query param
      const decoded = await server.jwt.verify(token);
      
      // Extract user info from JWT payload
      // JWT payload has { userId, email, sessionId } from login/register
      const userId = (decoded as any).userId;
      const email = (decoded as any).email;
      const sessionId = (decoded as any).sessionId;
      
      if (!userId) {
        throw new Error('User ID not found in token');
      }
      
      // Check session validity if sessionId exists
      if (sessionId) {
        const session = await prisma.authSession.findUnique({
          where: { id: sessionId },
        });
        
        if (!session || !session.isActive) {
          // Session has been invalidated (user logged in on another device)
          server.log.info({ userId, sessionId }, 'Session invalidated - user logged in on another device');
          reply.code(401).send({
            error: 'Session expired',
            code: 'SESSION_INVALIDATED',
            message: 'Your account has been logged in on another device',
          });
          throw new Error('Session invalidated');
        }
        
        // Update last active time
        await prisma.authSession.update({
          where: { id: sessionId },
          data: { lastActiveAt: new Date() },
        }).catch((err: unknown) => {
          // Log but don't fail if update fails
          server.log.warn({ err, sessionId }, 'Failed to update session lastActiveAt');
        });
      } else {
        // Legacy token without sessionId - log warning but allow access
        server.log.warn({ userId }, 'Token without sessionId detected (legacy token)');
      }
      
      request.user = {
        userId: userId,
        email: email,
      };
    } catch (err: unknown) {
      // JWT verification failed - return 401 unauthorized
      server.log.warn({ err }, 'JWT verification failed');
      reply.code(401).send({ 
        message: 'Unauthorized',
        error: 'Invalid or missing authentication token'
      });
      throw new Error('Unauthorized');
    }
  });

  // Optional authentication decorator - Try to authenticate but don't fail if token is missing
  // Useful for endpoints that have different behavior for authenticated vs unauthenticated users
  // Note: Will still throw error if session is invalidated (user logged in on another device)
  server.decorate('optionalAuthenticate', async function (request: any, reply: any) {
    try {
      // Skip authentication for OPTIONS preflight requests
      if (request.method === 'OPTIONS') {
        return false;
      }
      
      // For WebSocket connections, React Native cannot send Authorization header
      // So we also check query parameter for token
      let token: string | undefined;
      
      // First try to get token from Authorization header
      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
      
      // If no token in header, try query parameter (for WebSocket)
      if (!token) {
        const query = request.query as { token?: string };
        token = query?.token;
      }
      
      if (!token) {
        return false; // No token, but that's okay for optional auth
      }
      
      // Verify JWT token
      const decoded = await server.jwt.verify(token);
      
      // Extract user info from JWT payload
      const userId = (decoded as any).userId;
      const email = (decoded as any).email;
      const sessionId = (decoded as any).sessionId;
      
      if (!userId) {
        return false; // Invalid token, but that's okay for optional auth
      }
      
      // Check session validity if sessionId exists
      if (sessionId) {
        const session = await prisma.authSession.findUnique({
          where: { id: sessionId },
        });
        
        if (!session || !session.isActive) {
          // Session has been invalidated (user logged in on another device)
          // This is a critical error that should trigger logout, not silent failure
          server.log.info({ userId, sessionId }, 'Session invalidated - user logged in on another device');
          reply.code(401).send({
            error: 'Session expired',
            code: 'SESSION_INVALIDATED',
            message: 'Your account has been logged in on another device',
          });
          throw new Error('Session invalidated');
        }
        
        // Update last active time
        await prisma.authSession.update({
          where: { id: sessionId },
          data: { lastActiveAt: new Date() },
        }).catch((err: unknown) => {
          // Log but don't fail if update fails
          server.log.warn({ err, sessionId }, 'Failed to update session lastActiveAt');
        });
      } else {
        // Legacy token without sessionId - log warning but allow access
        server.log.warn({ userId }, 'Token without sessionId detected (legacy token)');
      }
      
      request.user = {
        userId: userId,
        email: email,
      };
      
      return true; // Successfully authenticated
    } catch (err: unknown) {
      // Check if this is a session invalidation error (should propagate to client)
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage === 'Session invalidated') {
        throw err; // Propagate session invalidation error
      }
      
      // Other authentication failures are okay for optional auth
      return false;
    }
  });

  // Health check route (also /api/health for Vercel rewrite so /health -> /api/health matches)
  const healthHandler = async (_request: any, reply: any) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return reply.send({ status: 'ok' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      server.log.error({ error: errorMessage, stack: errorStack }, 'Health check failed - database connection error');
      return reply.code(503).send({
        status: 'error',
        message: 'Database connection failed',
        error: errorMessage,
      });
    }
  };
  server.get('/health', healthHandler);
  server.get('/api/health', healthHandler);

  // Error handler (must be defined before registering encapsulated plugins)
  server.setErrorHandler((error: any, _request, reply) => {
    server.log.error(error, '[FastifyErrorHandler] caught error');

    if (hasZodFastifySchemaValidationErrors(error) || error.validation) {
      return reply.code(400).send({
        message: 'Validation error',
        details: error.validation ?? error.details,
      });
    }

    return reply.code(error.statusCode || 500).send({
      message: error.message || 'Internal server error',
    });
  });

  // Register API routes (single pass)
  await server.register(authRoutes, { prefix: '/api/v1/auth' });
  await server.register(sessionRoutes, { prefix: '/api/v1/sessions' });
  await server.register(eventRoutes, { prefix: '/api/v1/events' });
  await server.register(evaluationRoutes, { prefix: '/api/v1/evaluation' });
  await server.register(airportRoutes, { prefix: '/api/v1/airports' });
  await server.register(trainingModeRoutes, { prefix: '/api/v1/training-modes' });
  await server.register(aircraftTypeRoutes, { prefix: '/api/v1/aircraft-types' });
  await server.register(ttsRoutes, { prefix: '/api/v1/tts' });
  await server.register(liveatcRoutes, { prefix: '/api/v1/liveatc' });
  await server.register(feedbackRoutes, { prefix: '/api/v1/feedback' });
  await server.register(recordingRoutes, { prefix: '/api/v1/recordings' });
  await server.register(membershipRoutes, { prefix: '/api/v1/membership' });
  await server.register(appleWebhookRoutes, { prefix: '/api/v1/webhooks' });
  await server.register(versionRoutes, { prefix: '/api/v1/version' });
  await server.register(clientLogRoutes, { prefix: '/api/v1/client-logs' });

  return server;
}

/**
 * Gracefully shutdown the server
 */
async function gracefulShutdown(server: any, signal: string) {
  server.log.info(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  
  try {
    // Close the server
    await server.close();
    server.log.info('✅ Server closed successfully');
    
    // Close database connection
    await prisma.$disconnect();
    server.log.info('✅ Database connection closed');
    
    server.log.info('✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    server.log.error({ error }, '❌ Error during graceful shutdown');
    process.exit(1);
  }
}

/**
 * Start the server
 */
async function start() {
  try {
    const server = await buildServer();

    await server.listen({
      port: env.PORT,
      host: '0.0.0.0',
    });

    server.log.info(`🚀 Server listening on http://localhost:${env.PORT}`);
    server.log.info(`📊 Health check available at http://localhost:${env.PORT}/health`);
    server.log.info(`🔐 Auth endpoints at http://localhost:${env.PORT}/api/v1/auth`);
    server.log.info(`📝 Session endpoints at http://localhost:${env.PORT}/api/v1/sessions`);
    server.log.info(`🎯 Event endpoints at http://localhost:${env.PORT}/api/v1/events`);
    server.log.info(`📋 Evaluation endpoints at http://localhost:${env.PORT}/api/v1/evaluation`);
    server.log.info(`✈️  Airport endpoints at http://localhost:${env.PORT}/api/v1/airports`);
    server.log.info(`🔊 TTS endpoints at http://localhost:${env.PORT}/api/v1/tts`);
    server.log.info(`📻 LiveATC endpoints at http://localhost:${env.PORT}/api/v1/liveatc`);

    // Set up graceful shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown(server, 'SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown(server, 'SIGINT'));

  } catch (error) {
    // Use console.error here since server might not be fully initialized
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start server when run directly (allow Vercel dev, skip Vercel serverless)
const isVercelDev = process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'development';
if ((process.env.VERCEL !== '1' || isVercelDev) && import.meta.url === `file://${process.argv[1]}`) {
  start();
}

export { buildServer };

