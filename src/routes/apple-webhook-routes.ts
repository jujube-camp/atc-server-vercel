import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppleWebhookController } from '../controllers/appleWebhookController.js';

const appleWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  const server = fastify.withTypeProvider<ZodTypeProvider>();

  /**
   * POST /api/v1/webhooks/apple
   * Handle Apple Server-to-Server notifications
   * No authentication required - Apple sends these directly
   */
  server.post(
    '/apple',
    {
      schema: {
        // Apple payload contains many fields; validate the ones we rely on
        // and allow unknown fields to avoid breaking when Apple adds fields.
        body: z
          .object({
            notification_type: z.string().optional(), // Made optional for debugging
            password: z.string().optional(),
            environment: z.string().optional(),
            unified_receipt: z.any().optional(),
            // Apple may send different field names, accept all
          })
          .passthrough() // Allow all extra fields
          .optional(), // Make entire body optional for maximum compatibility
      },
    },
    async (request, reply) => {
      // Log raw body before processing
      request.log.info(
        { 
          rawBody: request.body,
          headers: request.headers,
        },
        '[AppleWebhook] 📨 Raw webhook request received'
      );
      await AppleWebhookController.handleNotification(request, reply);
    }
  );
};

export default appleWebhookRoutes;

