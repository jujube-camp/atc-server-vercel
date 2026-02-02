import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { aircraftTypeSchema } from '../common/index.js';
import { AircraftTypeController } from '../controllers/aircraftTypeController.js';

const aircraftTypeRoutes: FastifyPluginAsync = async (fastify) => {
  const server = fastify.withTypeProvider<ZodTypeProvider>();

  server.get(
    '/',
    {
      onRequest: [server.authenticate],
      schema: {
        response: {
          200: z.array(aircraftTypeSchema),
        },
      },
    },
    async (request, reply) => {
      await AircraftTypeController.list(request, reply);
    }
  );
};

export default aircraftTypeRoutes;

