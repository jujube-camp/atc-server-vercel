import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { FeedbackController } from '../controllers/feedbackController.js';

const feedbackRoutes: FastifyPluginAsync = async (fastify) => {
  const server = fastify.withTypeProvider<ZodTypeProvider>();

  const feedbackBodySchema = z.object({
    message: z.string().min(5).max(2000),
    category: z.string().max(120).optional(),
    contact: z.string().max(200).optional(),
    platform: z.string().max(50).optional(),
    appVersion: z.string().max(50).optional(),
    metadata: z.record(z.any()).optional(),
  });

  server.post(
    '/',
    {
      onRequest: [server.authenticate],
      schema: {
        body: feedbackBodySchema,
        response: {
          201: z.object({
            success: z.boolean(),
          }),
        },
      },
    },
    async (request, reply) => {
      await FeedbackController.submitFeedback(request as any, reply);
    }
  );
};

export default feedbackRoutes;


