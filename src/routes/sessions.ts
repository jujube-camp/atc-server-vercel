import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createSessionSchema,
  sessionResponseSchema,
  sessionListItemSchema,
  sessionLocationResponseSchema,
} from '../common/index.js';
import { SessionController } from '../controllers/sessionController.js';

const sessionRoutes: FastifyPluginAsync = async (fastify) => {
  const server = fastify.withTypeProvider<ZodTypeProvider>();

  /**
   * GET /api/v1/sessions
   * List sessions for the authenticated user (latest 20)
   */
  server.get(
    '/',
    {
      onRequest: [server.authenticate],
      schema: {
        response: {
          200: z.array(sessionListItemSchema),
        },
      },
    },
    async (request, reply) => {
      await SessionController.getUserSessions(request, reply);
    }
  );

  /**
   * POST /api/v1/sessions
   * Create a new session
   */
  server.post(
    '/',
    {
      onRequest: [server.authenticate],
      schema: {
        body: createSessionSchema,
        response: {
          201: sessionResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await SessionController.createSession(request, reply);
    }
  );

  /**
   * GET /api/v1/sessions/:sessionId/records
   * Get transmissions with evaluations for a session
   */
  server.get(
    '/:sessionId/records',
    {
      onRequest: [server.authenticate],
      schema: {
        params: z.object({ sessionId: z.string() }),
        querystring: z.object({
          page: z.coerce.number().int().positive().optional(),
          pageSize: z.coerce.number().int().positive().max(200).optional(),
        }).optional(),
      },
    },
    async (request, reply) => {
      await SessionController.getSessionRecords(request, reply);
    }
  );

  /**
   * GET /api/v1/sessions/:sessionId
   * Get a session by ID
   */
  server.get(
    '/:sessionId',
    {
      onRequest: [server.authenticate],
      schema: {
        params: z.object({ sessionId: z.string() }),
        response: {
          200: sessionResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await SessionController.getSession(request, reply);
    }
  );

  /**
   * GET /api/v1/sessions/:sessionId/location
   * Get the latest inferred location for a session
   */
  server.get(
    '/:sessionId/location',
    {
      onRequest: [server.authenticate],
      schema: {
        params: z.object({ sessionId: z.string() }),
        response: {
          200: sessionLocationResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await SessionController.getSessionLocation(request, reply);
    }
  );

  /**
   * GET /api/v1/sessions/:sessionId/summary
   * Get per-phase averages and overall average score for a session
   */
  server.get(
    '/:sessionId/summary',
    {
      onRequest: [server.authenticate],
      schema: {
        params: z.object({ sessionId: z.string() }),
        response: {
          200: z.object({
            sessionId: z.string(),
            overallAverage: z.number().nullable(),
            phaseAverages: z.record(z.string(), z.number()),
          }),
        },
      },
    },
    async (request, reply) => {
      await SessionController.getSessionSummary(request, reply);
    }
  );

  /**
   * DELETE /api/v1/sessions/:sessionId
   * Delete a session and all related data
   */
  server.delete(
    '/:sessionId',
    {
      onRequest: [server.authenticate],
      schema: {
        params: z.object({ sessionId: z.string() }),
        response: {
          200: z.object({
            success: z.boolean(),
          }),
        },
      },
    },
    async (request, reply) => {
      await SessionController.deleteSession(request, reply);
    }
  );

};

export default sessionRoutes;
