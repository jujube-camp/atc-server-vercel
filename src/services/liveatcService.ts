/**
 * Service for LiveATC.net feeds
 * LiveATC.net provides real-time ATC audio streams
 * Stream URLs can be:
 * - .pls playlist files: https://www.liveatc.net/play/{mount}.pls
 * - Direct stream URLs: https://www.liveatc.net/{mount}
 */

import { prisma } from '../utils/prisma.js';

interface ATCFeed {
  id: string;
  name: string;
  location: string;
  icao: string;
  country: string;
  region: string;
  streamUrl: string;
  isFree: boolean;
  isFeatured?: boolean;
}

interface Region {
  id: string;
  name: string;
  color: string;
}

export class LiveATCService {
  /**
   * Get all feeds from database
   * Note: region and featured parameters are kept for API compatibility but are not used
   * @param userId Optional user ID to check membership for feed access
   */
  static async getFeeds(_region?: string, _featured?: boolean, _userId?: string): Promise<ATCFeed[]> {
    // Query all feeds from database
    const feeds = await prisma.liveATCFeed.findMany({
      orderBy: {
        icao: 'asc',
      },
    });

    // Transform database feeds to API format
    const transformedFeeds: ATCFeed[] = feeds.map(feed => {
      // Ensure streamUrl is always a string (required by schema)
      const streamUrl = feed.streamUrl || feed.plsUrl || '';
      
      // Ensure isFree is always a boolean (required by schema)
      // Handle case where isFree might be null (for existing records before migration)
      // Type assertion needed because Prisma types may not be updated yet
      const feedWithIsFree = feed as typeof feed & { isFree?: boolean };
      const isFree = feedWithIsFree.isFree ?? false;
      
      // Ensure all required string fields are not null/undefined
      return {
        id: feed.id || '',
        name: feed.name || '',
        location: feed.icao || '',
        icao: feed.icao || '',
        country: '', // Not used, kept for API compatibility
        region: '', // Not used, kept for API compatibility
        streamUrl: streamUrl || '',
        isFree: isFree,
        isFeatured: false, // No featured feeds
      };
    });

    // Note: region and featured filters are ignored as per requirements
    return transformedFeeds;
  }

  /**
   * Get all available regions (returns empty array as regions are not used)
   */
  static async getRegions(): Promise<Region[]> {
    // Return empty array as regions are not used
    return [];
  }
}

