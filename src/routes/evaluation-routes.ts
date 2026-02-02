import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  evaluationRequirementsRequestSchema,
  evaluationRequirementsResponseSchema,
  errorResponseSchema,
} from '../common/index.js';
import { EvaluationController } from '../controllers/evaluationController.js';

/**
 * Routes for evaluation and assessment operations
 */
const evaluationRoutes: FastifyPluginAsync = async (fastify) => {
  const server = fastify.withTypeProvider<ZodTypeProvider>();

  /**
   * POST /api/v1/evaluation/requirements
   * Evaluate if pilot has met all requirements to advance to next phase
   */
  server.post(
    '/requirements',
    {
      onRequest: [server.authenticate],
      schema: {
        body: evaluationRequirementsRequestSchema,
        response: {
          200: evaluationRequirementsResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await EvaluationController.evaluateRequirements(request, reply);
    }
  );
};

export default evaluationRoutes;

