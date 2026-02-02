#!/usr/bin/env tsx
/**
 * Update hasFreqs field for all airports based on freqs in jsonData
 * 
 * This script:
 * 1. Reads all airports from the database
 * 2. Parses jsonData to check if freqs field exists and has items
 * 3. Updates hasFreqs field (1 = has freqs, 0 = no freqs)
 * 
 * Usage:
 *   tsx scripts/update_airport_freqs.ts
 *   dotenv -e .env.development -- tsx scripts/update_airport_freqs.ts
 */

import { prisma } from '../src/utils/prisma.js';

interface JsonData {
  freqs?: Array<{
    type?: string;
    frequency_mhz?: string;
    [key: string]: any;
  }>;
  [key: string]: any;
}

/**
 * Check if airport has frequency information in jsonData
 * @param jsonDataStr - JSON string from database
 * @returns true if freqs exists and has at least one item, false otherwise
 */
function hasFreqs(jsonDataStr: string | null | undefined): boolean {
  if (!jsonDataStr || jsonDataStr.trim() === '') {
    return false;
  }

  try {
    const jsonData: JsonData = JSON.parse(jsonDataStr);
    
    // Check if freqs exists and is an array with at least one item
    if (Array.isArray(jsonData.freqs) && jsonData.freqs.length > 0) {
      // Additional check: ensure at least one freq has valid data
      return jsonData.freqs.some(
        (freq) => freq && (freq.type || freq.frequency_mhz)
      );
    }
    
    return false;
  } catch (error) {
    console.error('Error parsing jsonData:', error);
    return false;
  }
}

async function updateAirportFreqs() {
  console.log(`[${new Date().toISOString()}] Starting airport freqs update...`);

  try {
    // Fetch all airports
    const airports = await prisma.airport.findMany({
      select: {
        id: true,
        icaoCode: true,
        jsonData: true,
        hasFreqs: true,
      },
    });

    console.log(`[${new Date().toISOString()}] Found ${airports.length} airports`);

    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // Process airports in batches
    const BATCH_SIZE = 100;
    for (let i = 0; i < airports.length; i += BATCH_SIZE) {
      const batch = airports.slice(i, i + BATCH_SIZE);
      
      await Promise.all(
        batch.map(async (airport) => {
          try {
            const hasFreqsValue = hasFreqs(airport.jsonData);
            const newHasFreqs = hasFreqsValue ? 1 : 0;

            // Only update if value changed
            if (airport.hasFreqs !== newHasFreqs) {
              await prisma.airport.update({
                where: { id: airport.id },
                data: { hasFreqs: newHasFreqs },
              });
              updatedCount++;
              
              if (updatedCount % 100 === 0) {
                console.log(
                  `[${new Date().toISOString()}] Updated ${updatedCount} airports...`
                );
              }
            } else {
              skippedCount++;
            }
          } catch (error) {
            errorCount++;
            console.error(
              `[${new Date().toISOString()}] Error updating airport ${airport.icaoCode || airport.id}:`,
              error
            );
          }
        })
      );
    }

    console.log(`[${new Date().toISOString()}] Update completed:`);
    console.log(`  - Updated: ${updatedCount}`);
    console.log(`  - Skipped (no change): ${skippedCount}`);
    console.log(`  - Errors: ${errorCount}`);
    console.log(`  - Total: ${airports.length}`);

    // Print summary statistics
    const stats = await prisma.airport.groupBy({
      by: ['hasFreqs'],
      _count: true,
    });

    console.log(`[${new Date().toISOString()}] Summary by hasFreqs:`);
    stats.forEach((stat) => {
      const value = stat.hasFreqs === null ? 'null' : stat.hasFreqs;
      console.log(`  - hasFreqs=${value}: ${stat._count} airports`);
    });
  } catch (error: any) {
    console.error(`[${new Date().toISOString()}] Fatal error:`, error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
updateAirportFreqs()
  .then(() => {
    console.log(`[${new Date().toISOString()}] Script completed successfully`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(`[${new Date().toISOString()}] Script failed:`, error);
    process.exit(1);
  });

