import { FastifyRequest, FastifyReply } from 'fastify';
import { LiveATCService } from '../services/liveatcService.js';
import { FavoriteFeedService } from '../services/favoriteFeedService.js';

export class LiveATCController {
  /**
   * Get list of available LiveATC feeds
   */
  static async getFeeds(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const { region, featured } = (request.query ?? {}) as {
      region?: string;
      featured?: boolean;
    };

    // Get userId if authenticated (optional for public access)
    const userId = (request as any).user?.userId;

    const feeds = await LiveATCService.getFeeds(region, featured, userId);
    return reply.send(feeds);
  }

  /**
   * Get list of available regions
   */
  static async getRegions(
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const regions = await LiveATCService.getRegions();
    return reply.send(regions);
  }

  /**
   * Add a feed to favorites
   */
  static async addFavorite(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const userId = (request as any).user?.userId;
    if (!userId) {
      return reply.code(401).send({ message: 'Unauthorized' });
    }

    const { feedId } = request.body as { feedId: string };
    if (!feedId) {
      return reply.code(400).send({ message: 'feedId is required' });
    }

    try {
      const favorite = await FavoriteFeedService.addFavorite(userId, feedId);
      return reply.send({ success: true, favorite });
    } catch (error: any) {
      console.error('Error in addFavorite controller:', error);
      if (error.message === 'Feed already favorited') {
        return reply.code(409).send({ message: error.message });
      }
      // Return more detailed error message for debugging
      const errorMessage = error.message || 'Failed to add favorite';
      return reply.code(500).send({ message: errorMessage });
    }
  }

  /**
   * Remove a feed from favorites
   */
  static async removeFavorite(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const userId = (request as any).user?.userId;
    if (!userId) {
      return reply.code(401).send({ message: 'Unauthorized' });
    }

    const { feedId } = request.body as { feedId: string };
    if (!feedId) {
      return reply.code(400).send({ message: 'feedId is required' });
    }

    try {
      await FavoriteFeedService.removeFavorite(userId, feedId);
      return reply.send({ success: true });
    } catch (error: any) {
      return reply.code(500).send({ message: 'Failed to remove favorite' });
    }
  }

  /**
   * Get user's favorite feeds (optional authentication)
   * Returns empty array if not authenticated
   */
  static async getFavorites(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const userId = (request as any).user?.userId;
    if (!userId) {
      return reply.send([]);  // Return empty array if not authenticated
    }

    try {
      const favorites = await FavoriteFeedService.getFavorites(userId);
      return reply.send(favorites);
    } catch (error: any) {
      return reply.code(500).send({ message: 'Failed to get favorites' });
    }
  }

  /**
   * Check if a feed is favorited
   */
  static async checkFavorite(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const userId = (request as any).user?.userId;
    if (!userId) {
      return reply.send({ isFavorited: false });
    }

    const { feedId } = request.query as { feedId?: string };
    if (!feedId) {
      return reply.code(400).send({ message: 'feedId is required' });
    }

    try {
      const isFavorited = await FavoriteFeedService.isFavorited(userId, feedId);
      return reply.send({ isFavorited });
    } catch (error: any) {
      return reply.send({ isFavorited: false });
    }
  }
}

