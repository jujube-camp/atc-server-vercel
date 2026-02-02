import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { VersionController } from '../controllers/versionController.js';

const versionRoutes: FastifyPluginAsync = async (fastify) => {
  const server = fastify.withTypeProvider<ZodTypeProvider>();

  /**
   * POST /api/v1/version/check
   * Check if the app version is up to date
   */
  server.post(
    '/check',
    {
      schema: {
        body: z.object({
          currentVersion: z.string(),
          platform: z.enum(['ios', 'android']),
        }),
        response: {
          200: z.object({
            isUpdateRequired: z.boolean(),
            isUpdateAvailable: z.boolean(),
            minimumVersion: z.string(),
            latestVersion: z.string(),
            currentVersion: z.string(),
            updateMessage: z.string(),
            updateUrl: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      await VersionController.checkVersion(request as any, reply);
    }
  );
};

export default versionRoutes;

