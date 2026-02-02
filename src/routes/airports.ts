import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  airportRequestSchema,
  airportResponseSchema,
} from '../common/index.js';
import { AirportController } from '../controllers/airportController.js';

const airportRoutes: FastifyPluginAsync = async (fastify) => {
  const server = fastify.withTypeProvider<ZodTypeProvider>();

  /**
   * GET /api/v1/airports
   * Get airport information by ICAO code
   */
  server.get(
    '/',
    {
      schema: {
        querystring: airportRequestSchema,
        response: {
          200: airportResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await AirportController.getAirportByIcaoCode(request, reply);
    }
  );

  /**
   * GET /api/v1/airports/all
   * Get all airports with optional field selection
   * Query params: fields (optional) - comma-separated list of field names
   */
  server.get(
    '/all',
    {
      schema: {
        querystring: z.object({
          fields: z.union([z.string(), z.array(z.string())]).optional(),
        }).optional(),
        response: {
          200: z.array(z.any()),
        },
      },
    },
    async (request, reply) => {
      await AirportController.getAllAirports(request, reply);
    }
  );
};

export default airportRoutes;

