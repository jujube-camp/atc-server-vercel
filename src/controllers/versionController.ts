import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getLatestIOSVersion, getLatestAndroidVersion } from '../services/appStoreService.js';

const versionCheckRequestSchema = z.object({
  currentVersion: z.string(),
  platform: z.enum(['ios', 'android']),
});

type VersionCheckRequest = z.infer<typeof versionCheckRequestSchema>;

/**
 * App Store IDs and Package Names
 * Update these with your actual app identifiers
 */
const APP_IDENTIFIERS = {
  ios: {
    appId: '6754862272', // Aviate AI - iOS App Store ID
  },
  android: {
    packageName: 'com.jujubecamp.aviateai', // Your Android package name
  },
};

/**
 * Controller for version checking
 */
export class VersionController {
  /**
   * Check if the app version is up to date
   * POST /api/v1/version/check
   * 
   * This endpoint fetches the latest version directly from App Store / Google Play
   * and requires users to update if their version is lower than the store version.
   */
  static async checkVersion(
    request: FastifyRequest<{ Body: VersionCheckRequest }>,
    reply: FastifyReply
  ) {
    const { currentVersion, platform } = request.body;
    
    // Fetch latest version from store
    let latestVersion: string | null = null;
    
    if (platform === 'ios') {
      latestVersion = await getLatestIOSVersion(APP_IDENTIFIERS.ios.appId);
    } else {
      latestVersion = await getLatestAndroidVersion(APP_IDENTIFIERS.android.packageName);
    }
    
    // If store API fails, allow app to continue (fail-safe)
    // Don't block users if we can't check the store
    if (!latestVersion) {
      console.warn(`[VersionCheck] Could not fetch latest ${platform} version from store, allowing app to continue`);
      return reply.send({
        isUpdateRequired: false,
        isUpdateAvailable: false,
        minimumVersion: currentVersion,
        latestVersion: currentVersion,
        currentVersion,
        updateMessage: 'Unable to check for updates. You can continue using the app.',
        updateUrl: platform === 'ios'
          ? 'https://apps.apple.com/app/aviate-ai/id6754862272'
          : 'https://play.google.com/store/apps/details?id=com.jujubecamp.aviateai',
      });
    }

    // Compare versions: if current < latest, require update
    const isUpdateRequired = compareVersions(currentVersion, latestVersion) < 0;
    const isUpdateAvailable = isUpdateRequired; // Same logic: any version difference requires update

    return reply.send({
      isUpdateRequired,
      isUpdateAvailable,
      minimumVersion: latestVersion, // Minimum = Latest (always require latest version)
      latestVersion,
      currentVersion,
      updateMessage: isUpdateRequired
        ? 'To continue enjoying Aviate AI, please update to the latest version. It only takes a moment!'
        : 'You are using the latest version.',
      updateUrl: platform === 'ios'
        ? 'https://apps.apple.com/app/aviate-ai/id6754862272' // Aviate AI App Store URL
        : 'https://play.google.com/store/apps/details?id=com.jujubecamp.aviateai', // Android Play Store URL
    });
  }
}

/**
 * Compare two semantic version strings
 * Returns:
 *   -1 if version1 < version2
 *    0 if version1 === version2
 *    1 if version1 > version2
 * 
 * Handles version strings with suffixes (e.g., "1.0.0-beta", "2.0.0rc1")
 * by extracting numeric parts and comparing them correctly.
 */
function compareVersions(version1: string, version2: string): number {
  /**
   * Extract numeric part from a version segment
   * Examples: "1" -> 1, "0-beta" -> 0, "0rc1" -> 0
   */
  const parseVersionPart = (part: string): number => {
    // Extract leading numeric digits
    const match = part.match(/^\d+/);
    return match ? parseInt(match[0], 10) : 0;
  };

  const v1Parts = version1.split('.').map(parseVersionPart);
  const v2Parts = version2.split('.').map(parseVersionPart);

  for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
    const v1Part = v1Parts[i] || 0;
    const v2Part = v2Parts[i] || 0;

    if (v1Part < v2Part) return -1;
    if (v1Part > v2Part) return 1;
  }

  return 0;
}

