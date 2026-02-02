import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { LiveATCController } from '../controllers/liveatcController.js';

const liveatcRoutes: FastifyPluginAsync = async (fastify) => {
  const server = fastify.withTypeProvider<ZodTypeProvider>();

  /**
   * GET /api/v1/liveatc/feeds
   * Get list of available LiveATC feeds
   * Query params:
   *   - region?: string - Filter by region (usa, europe, asia, canada, australia, south-america)
   *   - featured?: boolean - Get only featured feeds
   */
  server.get(
    '/feeds',
    {
      schema: {
        querystring: z.object({
          region: z.enum(['usa', 'europe', 'asia', 'canada', 'australia', 'south-america']).optional(),
          featured: z.coerce.boolean().optional(),
        }).optional(),
        response: {
          200: z.array(z.object({
            id: z.string(),
            name: z.string(),
            location: z.string(),
            icao: z.string(),
            country: z.string(),
            region: z.string(),
            streamUrl: z.string(),
            isFree: z.boolean(),
            isFeatured: z.boolean().optional(),
          })),
        },
      },
    },
    async (request, reply) => {
      await LiveATCController.getFeeds(request, reply);
    }
  );

  /**
   * GET /api/v1/liveatc/regions
   * Get list of available regions
   */
  server.get(
    '/regions',
    {
      schema: {
        response: {
          200: z.array(z.object({
            id: z.string(),
            name: z.string(),
            color: z.string(),
          })),
        },
      },
    },
    async (request, reply) => {
      await LiveATCController.getRegions(request, reply);
    }
  );

  /**
   * POST /api/v1/liveatc/favorites
   * Add a feed to favorites (requires authentication)
   */
  server.post(
    '/favorites',
    {
      onRequest: [(fastify as any).authenticate],
      schema: {
        body: z.object({
          feedId: z.string(),
        }),
        response: {
          200: z.object({
            success: z.boolean(),
            favorite: z.object({
              id: z.string(),
              userId: z.string(),
              feedId: z.string(),
              createdAt: z.string().or(z.date()),
            }),
          }),
          401: z.object({
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      await LiveATCController.addFavorite(request, reply);
    }
  );

  /**
   * DELETE /api/v1/liveatc/favorites
   * Remove a feed from favorites (requires authentication)
   */
  server.delete(
    '/favorites',
    {
      onRequest: [(fastify as any).authenticate],
      schema: {
        body: z.object({
          feedId: z.string(),
        }),
        response: {
          200: z.object({
            success: z.boolean(),
          }),
          401: z.object({
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      await LiveATCController.removeFavorite(request, reply);
    }
  );

  /**
   * GET /api/v1/liveatc/favorites
   * Get user's favorite feed IDs (optional authentication)
   * Returns empty array if not authenticated
   */
  server.get(
    '/favorites',
    {
      schema: {
        response: {
          200: z.array(z.string()),
        },
      },
    },
    async (request, reply) => {
      // Try to authenticate, but don't fail if not authenticated
      await (fastify as any).optionalAuthenticate(request, reply);
      await LiveATCController.getFavorites(request, reply);
    }
  );

  /**
   * GET /api/v1/liveatc/favorites/check
   * Check if a feed is favorited (optional authentication)
   */
  server.get(
    '/favorites/check',
    {
      schema: {
        querystring: z.object({
          feedId: z.string(),
        }),
        response: {
          200: z.object({
            isFavorited: z.boolean(),
          }),
        },
      },
    },
    async (request, reply) => {
      // Try to authenticate, but don't fail if not authenticated
      await (fastify as any).optionalAuthenticate(request, reply);
      await LiveATCController.checkFavorite(request, reply);
    }
  );
};

export default liveatcRoutes;

