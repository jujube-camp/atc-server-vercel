import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  trainingModeConfigSchema,
  trainingModeSchema,
} from '../common/index.js';
import { TrainingModeController } from '../controllers/trainingModeController.js';

const trainingModeRoutes: FastifyPluginAsync = async (fastify) => {
  const server = fastify.withTypeProvider<ZodTypeProvider>();

  server.get(
    '/',
    {
      schema: {
        response: {
          200: z.array(trainingModeConfigSchema),
        },
      },
    },
    async (request, reply) => {
      await TrainingModeController.getTrainingModes(request, reply);
    }
  );

  server.get(
    '/:trainingMode',
    {
      schema: {
        params: z.object({
          trainingMode: trainingModeSchema,
        }),
        response: {
          200: trainingModeConfigSchema,
        },
      },
    },
    async (request, reply) => {
      await TrainingModeController.getTrainingModeConfig(request as any, reply);
    }
  );
};

export default trainingModeRoutes;

