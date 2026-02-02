#!/usr/bin/env tsx
/**
 * Script to fetch LiveATC feeds for a given ICAO code
 * 
 * Usage:
 *   tsx scripts/fetch_liveatc_feeds.ts <icao>
 *   Example: tsx scripts/fetch_liveatc_feeds.ts ksjc
 * 
 * This script:
 * 1. Fetches HTML from liveatc.net/search/?icao=<icao>
 * 2. Parses HTML to extract all .pls file links
 * 3. Constructs full URLs for each .pls file
 * 4. Saves results to PostgreSQL database
 */

import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import https from 'https';
import { prisma } from '../src/utils/prisma.js';
import { parseLiveATCHTML } from '../src/utils/parseLiveATC.js';
import { env } from '../src/config/env.js';

const BASE_URL = 'https://www.liveatc.net';

interface FetchOptions {
  icao: string;
  baseUrl?: string;
}

/**
 * Fetch HTML content from LiveATC search page
 */
async function fetchLiveATCSearchPage(icao: string, baseUrl: string = BASE_URL): Promise<string> {
  const url = `${baseUrl}/search/?icao=${icao.toLowerCase()}`;
  console.log(`📡 Fetching: ${url}`);
  
  // Temporarily disable SSL certificate verification
  // This is needed for environments with SSL certificate issues
  const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  
  try {
    // Create an HTTPS agent that ignores SSL certificate errors
    // This is necessary for environments with SSL certificate issues
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false,
    });
    
    // Configure proxy if available
    const proxyUrl = env.HTTPS_PROXY || env.HTTP_PROXY || env.PROXY;
    let agent: any = httpsAgent;
    
    if (proxyUrl) {
      console.log(`🔗 Using proxy: ${proxyUrl}`);
      // HttpsProxyAgent should inherit the SSL settings from the underlying agent
      // If it doesn't work, we'll fall back to using httpsAgent directly
      try {
        agent = new HttpsProxyAgent(proxyUrl);
        // The proxy agent should work with the environment variable set above
      } catch (proxyError) {
        console.warn(`⚠️  Proxy agent creation failed, using direct connection: ${proxyError}`);
        agent = httpsAgent;
      }
    }
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      // @ts-ignore - node-fetch agent typing
      agent: agent,
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const html = await response.text();
    console.log(`✅ Fetched ${html.length} bytes of HTML`);
    return html;
  } catch (error: any) {
    throw new Error(`Failed to fetch LiveATC page: ${error.message}`);
  } finally {
    // Restore original SSL certificate verification setting
    if (originalRejectUnauthorized !== undefined) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
    } else {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    }
  }
}

/**
 * Save feeds to database
 */
async function saveFeedsToDatabase(feeds: Array<{
  mount: string;
  name: string;
  icao: string;
  plsUrl: string;
  streamUrl: string;
}>) {
  console.log(`\n💾 Saving ${feeds.length} feeds to database...`);
  
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  
  for (const feed of feeds) {
    try {
      // Use upsert to avoid duplicates
      const result = await prisma.liveATCFeed.upsert({
        where: {
          icao_mount: {
            icao: feed.icao.toUpperCase(),
            mount: feed.mount,
          },
        },
        update: {
          name: feed.name,
          plsUrl: feed.plsUrl,
          streamUrl: feed.streamUrl,
        },
        create: {
          mount: feed.mount,
          name: feed.name,
          icao: feed.icao.toUpperCase(),
          plsUrl: feed.plsUrl,
          streamUrl: feed.streamUrl,
          isFree: feed.icao.toUpperCase() === 'KSJC', // Only KSJC is free by default
        },
      });
      
      successCount++;
      console.log(`  ✅ ${feed.icao.toUpperCase()} - ${feed.name} (${feed.mount})`);
    } catch (error: any) {
      if (error.code === 'P2002') {
        // Unique constraint violation - already exists
        skippedCount++;
        console.log(`  ⏭️  Skipped (already exists): ${feed.icao.toUpperCase()} - ${feed.name}`);
      } else {
        errorCount++;
        console.error(`  ❌ Error saving ${feed.icao.toUpperCase()} - ${feed.name}: ${error.message}`);
      }
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`  ✅ Saved: ${successCount}`);
  console.log(`  ⏭️  Skipped (duplicates): ${skippedCount}`);
  console.log(`  ❌ Errors: ${errorCount}`);
}

/**
 * Main function
 */
async function main() {
  // Get ICAO code from command line arguments
  const icao = process.argv[2];
  
  if (!icao) {
    console.error('❌ Error: ICAO code is required');
    console.error('Usage: tsx scripts/fetch_liveatc_feeds.ts <icao>');
    console.error('Example: tsx scripts/fetch_liveatc_feeds.ts ksjc');
    process.exit(1);
  }
  
  // Validate ICAO format (should be 4 characters)
  if (icao.length !== 4) {
    console.error(`❌ Error: Invalid ICAO code format. Expected 4 characters, got "${icao}"`);
    process.exit(1);
  }
  
  try {
    console.log(`\n🚀 Starting LiveATC feed fetch for ICAO: ${icao.toUpperCase()}\n`);
    
    // Step 1: Fetch HTML
    const html = await fetchLiveATCSearchPage(icao);
    
    // Step 2: Parse HTML to extract .pls links
    console.log(`\n🔍 Parsing HTML for .pls links...`);
    const feeds = parseLiveATCHTML(html, icao.toUpperCase());
    
    if (feeds.length === 0) {
      console.log(`⚠️  No feeds found for ICAO: ${icao.toUpperCase()}`);
      console.log(`   This might mean:`);
      console.log(`   - The airport doesn't have LiveATC feeds`);
      console.log(`   - The HTML structure has changed`);
      console.log(`   - The ICAO code is incorrect`);
      process.exit(0);
    }
  
    console.log(`✅ Found ${feeds.length} feed(s):`);
    feeds.forEach((feed, index) => {
      console.log(`   ${index + 1}. ${feed.name}`);
      console.log(`      Mount: ${feed.mount}`);
      console.log(`      PLS URL: ${feed.plsUrl}`);
      console.log(`      Stream URL: ${feed.streamUrl}`);
    });
    
    // Step 3: Save to database
    await saveFeedsToDatabase(feeds);
    
    console.log(`\n✅ Process completed successfully!`);
  } catch (error: any) {
    console.error(`\n❌ Fatal error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

