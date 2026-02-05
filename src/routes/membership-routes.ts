import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { MembershipController } from '../controllers/membershipController.js';

const membershipRoutes: FastifyPluginAsync = async (fastify) => {
  const server = fastify.withTypeProvider<ZodTypeProvider>();

  /**
   * GET /api/v1/membership
   * Get current user's membership info and usage limits (optional authentication)
   * Returns default FREE tier if not authenticated
   */
  server.get(
    '/',
    {
      schema: {
        response: {
          200: z.object({
            membership: z.object({
              tier: z.enum(['FREE', 'PREMIUM']),
              expiresAt: z.date().nullable(),
              isActive: z.boolean(),
              subscriptionType: z.enum(['monthly', 'yearly']).nullable(),
            }),
            limits: z.object({
              maxTrainingSessions: z.number().nullable(),
              maxRecordingAnalyses: z.number().nullable(),
              trainingSessionsUsed: z.number(),
              recordingAnalysesUsed: z.number(),
              trainingSessionsResetAt: z.date().nullable(),
              recordingAnalysesResetAt: z.date().nullable(),
            }),
            // App-wide payment mode configuration
            paymentMode: z.enum(['FREEMIUM', 'PAYWALL']),
            // In PAYWALL mode, FREE (or expired) users must subscribe before using the app
            requiresSubscription: z.boolean(),
          }),
        },
      },
    },
    async (request, reply) => {
      // Try to authenticate, but don't fail if not authenticated
      await (fastify as any).optionalAuthenticate(request, reply);
      await MembershipController.getMembership(request, reply);
    }
  );

  /**
   * POST /api/v1/membership/verify-payment
   * Verify and process Apple payment
   */
  server.post(
    '/verify-payment',
    {
      onRequest: [server.authenticate],
      schema: {
        body: z.object({
          transactionId: z.string(),
          productId: z.string(),
          receiptData: z.string(),
          deviceId: z.string().optional(),
          deviceName: z.string().optional(),
          deviceModel: z.string().optional(),
        }),
        response: {
          200: z.object({
            success: z.boolean(),
            membership: z.object({
              tier: z.enum(['FREE', 'PREMIUM']),
              expiresAt: z.date().nullable(),
              isActive: z.boolean(),
              subscriptionType: z.enum(['monthly', 'yearly']).nullable(),
            }),
          }),
        },
      },
    },
    async (request, reply) => {
      await MembershipController.verifyPayment(request, reply);
    }
  );

  /**
   * GET /api/v1/membership/limits
   * Get usage limits for current user
   */
  server.get(
    '/limits',
    {
      onRequest: [server.authenticate],
      schema: {
        response: {
          200: z.object({
            maxTrainingSessions: z.number().nullable(),
            maxRecordingAnalyses: z.number().nullable(),
            trainingSessionsUsed: z.number(),
            recordingAnalysesUsed: z.number(),
            trainingSessionsResetAt: z.date().nullable(),
            recordingAnalysesResetAt: z.date().nullable(),
          }),
        },
      },
    },
    async (request, reply) => {
      await MembershipController.getLimits(request, reply);
    }
  );

  /**
   * GET /api/v1/membership/check-access
   * Check if user can access a specific feature
   */
  server.get(
    '/check-access',
    {
      onRequest: [server.authenticate],
      schema: {
        querystring: z.object({
          feature: z.enum(['liveatc', 'training_mode', 'recording_upload', 'recording_analysis']),
          icao: z.string().optional(),
          trainingMode: z.string().optional(),
        }),
        response: {
          200: z.object({
            canAccess: z.boolean(),
          }),
        },
      },
    },
    async (request, reply) => {
      await MembershipController.checkAccess(request, reply);
    }
  );

  /**
   * GET /api/v1/membership/plans
   * Get available membership plans
   */
  server.get(
    '/plans',
    {
      schema: {
        response: {
          200: z.object({
            plans: z.array(z.object({
              id: z.string(),
              tier: z.enum(['FREE', 'PREMIUM']),
              monthlyPrice: z.number(),
              yearlyPrice: z.number(),
              yearlyDiscount: z.number(),
              monthlyProductId: z.string(),
              yearlyProductId: z.string(),
              isActive: z.boolean(),
            })),
          }),
        },
      },
    },
    async (request, reply) => {
      await MembershipController.getPlans(request, reply);
    }
  );

  /**
   * GET /api/v1/membership/history
   * Get user's subscription history
   */
  server.get(
    '/history',
    {
      onRequest: [server.authenticate],
      schema: {
        response: {
          200: z.object({
            payments: z.array(z.object({
              id: z.string(),
              transactionId: z.string(),
              productId: z.string(),
              tier: z.enum(['FREE', 'PREMIUM']),
              amount: z.number(),
              currency: z.string(),
              status: z.string(),
              createdAt: z.date(),
            })),
          }),
        },
      },
    },
    async (request, reply) => {
      await MembershipController.getHistory(request, reply);
    }
  );

  /**
   * POST /api/v1/membership/restore
   * Restore purchases from Apple receipt
   */
  server.post(
    '/restore',
    {
      onRequest: [server.authenticate],
      schema: {
        body: z.object({
          receiptData: z.string(),
          deviceId: z.string(),
          deviceName: z.string().optional(),
          deviceModel: z.string().optional(),
        }),
        response: {
          200: z.object({
            success: z.boolean(),
            membership: z.object({
              tier: z.enum(['FREE', 'PREMIUM']),
              expiresAt: z.date().nullable(),
              isActive: z.boolean(),
              subscriptionType: z.enum(['monthly', 'yearly']).nullable(),
            }),
          }),
        },
      },
    },
    async (request, reply) => {
      await MembershipController.restorePurchases(request, reply);
    }
  );
};

export default membershipRoutes;
