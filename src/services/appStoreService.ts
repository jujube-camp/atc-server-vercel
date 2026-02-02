/**
 * Service for fetching app version information from App Store and Google Play
 */

interface AppStoreResponse {
  resultCount: number;
  results: Array<{
    version: string;
    trackId: number;
    bundleId: string;
    currentVersionReleaseDate: string;
  }>;
}

/**
 * Cache for store version information to avoid frequent API calls
 */
const versionCache = new Map<string, { version: string; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

/**
 * Fetch latest version from iOS App Store using iTunes Lookup API
 */
export async function getLatestIOSVersion(appId: string): Promise<string | null> {
  const cacheKey = `ios-${appId}`;
  const cached = versionCache.get(cacheKey);
  
  // Return cached version if still valid
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.version;
  }

  try {
    const url = `https://itunes.apple.com/lookup?id=${appId}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Aviate-AI-Server/1.0',
      },
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    if (!response.ok) {
      console.error(`[AppStore] Failed to fetch iOS version: ${response.status}`);
      return null;
    }

    const data = await response.json() as AppStoreResponse;

    if (data.resultCount === 0 || !data.results || data.results.length === 0) {
      console.error('[AppStore] No results found for app ID:', appId);
      return null;
    }

    const version = data.results[0].version;
    
    // Cache the result
    versionCache.set(cacheKey, { version, timestamp: Date.now() });
    
    console.log(`[AppStore] Fetched iOS version: ${version}`);
    return version;
  } catch (error) {
    console.error('[AppStore] Error fetching iOS version:', error);
    return null;
  }
}

/**
 * Fetch latest version from Google Play Store
 * Note: Google Play doesn't have an official public API for this.
 * We'll use web scraping as a fallback, but it's less reliable.
 * For production, consider using Google Play Developer API with proper credentials.
 */
export async function getLatestAndroidVersion(packageName: string): Promise<string | null> {
  const cacheKey = `android-${packageName}`;
  const cached = versionCache.get(cacheKey);
  
  // Return cached version if still valid
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.version;
  }

  try {
    // Try to scrape from Google Play Store page
    const url = `https://play.google.com/store/apps/details?id=${packageName}&hl=en`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    if (!response.ok) {
      console.error(`[PlayStore] Failed to fetch Android version: ${response.status}`);
      return null;
    }

    const html = await response.text();
    
    // Try to extract version from HTML
    // Google Play page format: [[["x.x.x"]]]
    const versionMatch = html.match(/\[\[\["([\d.]+)"\]\]\]/);
    
    if (versionMatch && versionMatch[1]) {
      const version = versionMatch[1];
      
      // Cache the result
      versionCache.set(cacheKey, { version, timestamp: Date.now() });
      
      console.log(`[PlayStore] Fetched Android version: ${version}`);
      return version;
    }

    console.error('[PlayStore] Could not extract version from HTML');
    return null;
  } catch (error) {
    console.error('[PlayStore] Error fetching Android version:', error);
    return null;
  }
}

/**
 * Clear version cache (useful for testing or manual refresh)
 */
export function clearVersionCache(): void {
  versionCache.clear();
  console.log('[AppStore] Version cache cleared');
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    size: versionCache.size,
    entries: Array.from(versionCache.entries()).map(([key, value]) => ({
      key,
      version: value.version,
      age: Date.now() - value.timestamp,
    })),
  };
}

