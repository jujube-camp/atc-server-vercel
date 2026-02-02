import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import multipart from '@fastify/multipart';
import { 
  registerSchema, 
  loginSchema,
  appleSignInSchema,
  appleVerifySchema,
  authResponseSchema,
  deleteAccountSchema,
  getCurrentUserResponseSchema,
  errorResponseSchema,
  updateDisplayNameSchema,
  updateDisplayNameResponseSchema,
} from '../schemas/authSchemas.js';
import { referralGenerateResponseSchema, referralValidateResponseSchema } from '../schemas/authSchemas.js';
import { AuthController } from '../controllers/authController.js';

const authRoutes: FastifyPluginAsync = async (fastify) => {
  const server = fastify.withTypeProvider<ZodTypeProvider>();
  
  // Register multipart plugin for file uploads
  await server.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB limit
    },
  });

  /**
   * POST /api/v1/auth/register
   * Register a new user
   */
  server.post(
    '/register',
    {
      schema: {
        body: registerSchema,
        response: {
          201: authResponseSchema,
          400: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await AuthController.register(request, reply, server);
    }
  );

  /**
   * POST /api/v1/auth/login
   * Login an existing user
   */
  server.post(
    '/login',
    {
      schema: {
        body: loginSchema,
        response: {
          200: authResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await AuthController.login(request, reply, server);
    }
  );

  /**
   * GET /api/v1/auth/me
   * Get current user info
   */
  server.get(
    '/me',
    {
      schema: {
        response: {
          200: getCurrentUserResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
      preHandler: async (request, reply) => {
        try {
          await request.jwtVerify();
        } catch (err) {
          reply.code(401).send({ message: 'Unauthorized' });
        }
      },
    },
    async (request, reply) => {
      await AuthController.getCurrentUser(request, reply);
    }
  );

  /**
   * POST /api/v1/auth/referral/generate
   * Generate or fetch user's referral code
   */
  server.post(
    '/referral/generate',
    {
      schema: {
        response: {
          200: referralGenerateResponseSchema,
          201: referralGenerateResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
      preHandler: async (request, reply) => {
        try {
          await request.jwtVerify();
        } catch (err) {
          reply.code(401).send({ message: 'Unauthorized' });
        }
      },
    },
    async (request, reply) => {
      await AuthController.generateReferralCode(request, reply);
    }
  );

  /**
   * GET /api/v1/auth/referral/validate?code=XXXXXXXX
   * Validate referral code
   */
  server.get(
    '/referral/validate',
    {
      schema: {
        response: {
          200: referralValidateResponseSchema,
          400: errorResponseSchema,
        },
        querystring: z.object({ code: z.string() }),
      },
    },
    async (request, reply) => {
      await AuthController.validateReferralCode(request, reply);
    }
  );

  /**
   * DELETE /api/v1/auth/account
   * Delete user account
   */
  server.delete(
    '/account',
    {
      schema: {
        body: deleteAccountSchema,
        response: {
          200: z.object({
            message: z.string(),
          }),
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
      preHandler: async (request, reply) => {
        try {
          await request.jwtVerify();
        } catch (err) {
          reply.code(401).send({ message: 'Unauthorized' });
        }
      },
    },
    async (request, reply) => {
      await AuthController.deleteAccount(request, reply);
    }
  );

  /**
   * POST /api/v1/auth/apple
   * Apple Sign-In
   */
  server.post(
    '/apple',
    {
      schema: {
        body: appleSignInSchema,
        response: {
          200: authResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          409: errorResponseSchema, // Conflict - account already exists
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await AuthController.appleSignIn(request, reply, server);
    }
  );

  /**
   * POST /api/v1/auth/apple/verify
   * Verify Apple identity token (for debugging/testing)
   */
  server.post(
    '/apple/verify',
    {
      schema: {
        body: appleVerifySchema,
        response: {
          200: z.object({
            valid: z.boolean(),
            payload: z.object({
              sub: z.string(),
              email: z.string().optional(),
              emailVerified: z.boolean().optional(),
            }).optional(),
            message: z.string().optional(),
          }),
          400: z.union([
            z.object({
              valid: z.boolean(),
              message: z.string(),
            }),
            // Fastify validation error format
            z.object({
              statusCode: z.number(),
              code: z.string(),
              error: z.string(),
              message: z.string(),
            }),
          ]),
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await AuthController.verifyAppleTokenEndpoint(request, reply);
    }
  );

  /**
   * POST /api/v1/auth/cockpit-tour/complete
   * Mark cockpit tour as completed
   */
  server.post(
    '/cockpit-tour/complete',
    {
      schema: {
        response: {
          200: z.object({
            message: z.string(),
            hasCompletedCockpitTour: z.boolean(),
          }),
          401: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
      preHandler: async (request, reply) => {
        try {
          await request.jwtVerify();
        } catch (err) {
          reply.code(401).send({ message: 'Unauthorized' });
        }
      },
    },
    async (request, reply) => {
      await AuthController.completeCockpitTour(request, reply);
    }
  );

  /**
   * POST /api/v1/auth/avatar
   * Upload user avatar
   */
  server.post(
    '/avatar',
    {
      schema: {
        response: {
          200: z.object({
            message: z.string(),
            avatarUrl: z.string().nullable(),
          }),
          400: errorResponseSchema,
          401: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
      preHandler: async (request, reply) => {
        try {
          await request.jwtVerify();
        } catch (err) {
          reply.code(401).send({ message: 'Unauthorized' });
        }
      },
    },
    async (request, reply) => {
      await AuthController.uploadAvatar(request, reply);
    }
  );

  /**
   * PATCH /api/v1/auth/profile
   * Update user display name
   */
  server.patch(
    '/profile',
    {
      schema: {
        body: updateDisplayNameSchema,
        response: {
          200: updateDisplayNameResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
      preHandler: async (request, reply) => {
        try {
          await request.jwtVerify();
        } catch (err) {
          reply.code(401).send({ message: 'Unauthorized' });
        }
      },
    },
    async (request, reply) => {
      await AuthController.updateDisplayName(request, reply);
    }
  );
};

export default authRoutes;
