import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

/**
 * Client logging routes
 * Allows the mobile app to report errors/warnings that occur before server calls
 * (e.g., StoreKit/IAP errors that happen entirely on the client)
 */
const clientLogRoutes: FastifyPluginAsync = async (fastify) => {
  const server = fastify.withTypeProvider<ZodTypeProvider>();

  const logEntrySchema = z.object({
    level: z.enum(['info', 'warn', 'error']).default('warn'),
    category: z.string().max(50), // e.g., 'iap', 'auth', 'network'
    message: z.string().max(500),
    code: z.string().max(50).optional(), // e.g., 'already-owned', 'user-cancelled'
    context: z.record(z.any()).optional(), // Additional metadata
    appVersion: z.string().max(20).optional(),
    platform: z.string().max(20).optional(), // 'ios', 'android'
    deviceModel: z.string().max(50).optional(),
  });

  server.post(
    '/',
    {
      onRequest: [server.authenticate],
      schema: {
        body: logEntrySchema,
        response: {
          200: z.object({
            success: z.boolean(),
          }),
        },
      },
    },
    async (request, reply) => {
      const userId = (request.user as any)?.userId;
      const body = request.body as z.infer<typeof logEntrySchema>;
      
      const logData = {
        userId,
        category: body.category,
        code: body.code,
        context: body.context,
        appVersion: body.appVersion,
        platform: body.platform,
        deviceModel: body.deviceModel,
      };

      const logMessage = `[ClientLog:${body.category}] ${body.message}`;

      // Log at the appropriate level
      switch (body.level) {
        case 'error':
          request.log.error(logData, logMessage);
          break;
        case 'warn':
          request.log.warn(logData, logMessage);
          break;
        case 'info':
        default:
          request.log.info(logData, logMessage);
          break;
      }

      return reply.send({ success: true });
    }
  );
};

export default clientLogRoutes;
