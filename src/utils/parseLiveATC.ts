/**
 * Utility to parse LiveATC.net HTML pages and extract feed information
 */

interface ParsedFeed {
  mount: string;
  name: string;
  icao: string;
  plsUrl: string;
  streamUrl: string; // Direct stream URL (extracted from .pls or constructed)
}

/**
 * Parse HTML content from LiveATC.net search page
 * Extracts feed information including .pls URLs
 */
export function parseLiveATCHTML(html: string, icao: string): ParsedFeed[] {
  const feeds: ParsedFeed[] = [];
  
  // Pattern to match .pls URLs: /play/{mount}.pls
  const plsPattern = /\/play\/([a-z0-9_]+)\.pls/g;
  const plsMatches = [...html.matchAll(plsPattern)];
  
  // Pattern to match feed names (usually in <strong> tags before .pls links)
  // Look for patterns like "KSJC D-ATIS", "KSJC Del/Gnd/Misc", etc.
  const namePattern = /<strong>([^<]+)<\/strong>[\s\S]{0,500}?\/play\/([a-z0-9_]+)\.pls/g;
  const nameMatches = [...html.matchAll(namePattern)];
  
  // Create a map of mount -> name
  const mountToName = new Map<string, string>();
  nameMatches.forEach(match => {
    const name = match[1].trim();
    const mount = match[2];
    mountToName.set(mount, name);
  });
  
  // Extract all unique mounts
  const uniqueMounts = new Set<string>();
  plsMatches.forEach(match => {
    uniqueMounts.add(match[1]);
  });
  
  // Build feed objects
  uniqueMounts.forEach(mount => {
    const name = mountToName.get(mount) || `${icao} ${mount}`;
    const plsUrl = `https://www.liveatc.net/play/${mount}.pls`;
    // LiveATC.net streams are typically available at:
    // https://www.liveatc.net/{mount} or via Icecast
    // For now, we'll use the .pls URL and let the client parse it
    // Or construct the direct stream URL
    const streamUrl = `https://www.liveatc.net/${mount}`;
    
    feeds.push({
      mount,
      name: name.replace(icao, '').trim() || mount,
      icao,
      plsUrl,
      streamUrl,
    });
  });
  
  return feeds;
}

/**
 * Parse .pls file content to extract actual stream URL
 * .pls files are playlist files with format:
 * [playlist]
 * File1=http://stream.url:port/mount
 */
export async function parsePLSFile(plsContent: string): Promise<string | null> {
  // Look for File1= or File= lines
  const filePattern = /File\d*=(https?:\/\/[^\s]+)/i;
  const match = plsContent.match(filePattern);
  
  if (match && match[1]) {
    return match[1];
  }
  
  return null;
}

/**
 * Fetch and parse .pls file to get actual stream URL
 */
export async function getStreamUrlFromPLS(plsUrl: string): Promise<string | null> {
  try {
    const response = await fetch(plsUrl);
    if (!response.ok) {
      return null;
    }
    
    const content = await response.text();
    return await parsePLSFile(content);
  } catch (error) {
    console.error(`Failed to fetch PLS file ${plsUrl}:`, error);
    return null;
  }
}

