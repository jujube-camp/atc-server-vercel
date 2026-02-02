import { prisma } from '../utils/prisma.js';

export class FavoriteFeedService {
  /**
   * Add a feed to user's favorites
   */
  static async addFavorite(userId: string, feedId: string) {
    try {
      // Check if already favorited
      const existing = await prisma.favoriteFeed.findUnique({
        where: {
          userId_feedId: {
            userId,
            feedId,
          },
        },
      });

      if (existing) {
        throw new Error('Feed already favorited');
      }

      return prisma.favoriteFeed.create({
        data: {
          userId,
          feedId,
        },
      });
    } catch (error: any) {
      // Re-throw known errors
      if (error.message === 'Feed already favorited') {
        throw error;
      }
      
      // Handle Prisma unique constraint errors
      if (error.code === 'P2002') {
        throw new Error('Feed already favorited');
      }
      
      // Handle Prisma foreign key constraint errors
      if (error.code === 'P2003') {
        console.error('Foreign key constraint error:', error);
        throw new Error('Invalid user or feed');
      }
      
      // For other database errors, log and throw
      console.error('Error adding favorite:', error);
      console.error('Error code:', error.code);
      console.error('Error meta:', error.meta);
      throw new Error(error.message || 'Database error: Please ensure the database migration has been run');
    }
  }

  /**
   * Remove a feed from user's favorites
   */
  static async removeFavorite(userId: string, feedId: string) {
    try {
      return prisma.favoriteFeed.deleteMany({
        where: {
          userId,
          feedId,
        },
      });
    } catch (error: any) {
      // If table doesn't exist, just return (no-op)
      console.error('Error removing favorite:', error);
      // Return a result that matches the expected shape
      return { count: 0 };
    }
  }

  /**
   * Get all favorite feed IDs for a user
   */
  static async getFavorites(userId: string): Promise<string[]> {
    try {
      const favorites = await prisma.favoriteFeed.findMany({
        where: {
          userId,
        },
        select: {
          feedId: true,
        },
      });

      return favorites.map((f: { feedId: string }) => f.feedId);
    } catch (error: any) {
      // If table doesn't exist or other database error, return empty array
      // This can happen if migration hasn't been run yet
      console.error('Error getting favorites:', error);
      return [];
    }
  }

  /**
   * Check if a feed is favorited by user
   */
  static async isFavorited(userId: string, feedId: string): Promise<boolean> {
    try {
      const favorite = await prisma.favoriteFeed.findUnique({
        where: {
          userId_feedId: {
            userId,
            feedId,
          },
        },
      });

      return !!favorite;
    } catch (error: any) {
      // If table doesn't exist or other database error, return false
      // This can happen if migration hasn't been run yet
      console.error('Error checking favorite:', error);
      return false;
    }
  }
}

