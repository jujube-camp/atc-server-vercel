import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  transmissionRequestSchema,
  transmissionResponseSchema,
  phaseAdvanceRequestSchema,
  phaseAdvanceResponseSchema,
  errorResponseSchema,
} from '../common/index.js';
import { EventController } from '../controllers/eventController.js';

/**
 * Routes for user-triggered events (transmission, phase advance)
 */
const eventRoutes: FastifyPluginAsync = async (fastify) => {
  const server = fastify.withTypeProvider<ZodTypeProvider>();

  /**
   * POST /api/v1/events/transmission
   * Process a transmission event (pilot speaking on radio)
   */
  server.post(
    '/transmission',
    {
      onRequest: [server.authenticate],
      schema: {
        body: transmissionRequestSchema,
        response: {
          201: transmissionResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await EventController.processTransmission(request, reply);
    }
  );

  /**
   * POST /api/v1/events/phase-advance
   * Process a phase advance event (pilot advancing to next phase)
   */
  server.post(
    '/phase-advance',
    {
      onRequest: [server.authenticate],
      schema: {
        body: phaseAdvanceRequestSchema,
        response: {
          200: phaseAdvanceResponseSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await EventController.advancePhase(request, reply);
    }
  );
};

export default eventRoutes;

