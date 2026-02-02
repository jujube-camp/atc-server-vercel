#!/usr/bin/env tsx

/**
 * Script to view current tier limit configurations
 * 
 * Usage:
 *   pnpm tsx scripts/view-tier-limits.ts
 */

import { prisma } from '../src/utils/prisma.js';
import { logger } from '../src/utils/logger.js';

async function viewTierLimits() {
  logger.info('Fetching tier limit configurations...\n');

  const configs = await prisma.tierLimitConfig.findMany({
    orderBy: { tier: 'asc' },
  });

  if (configs.length === 0) {
    logger.info('⚠️  No tier limit configurations found in database.');
    logger.info('Run: pnpm tsx scripts/update-tier-limits.ts to initialize.');
    return;
  }

  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                    TIER LIMIT CONFIGURATIONS                       ║');
  console.log('╠════════════════════════════════════════════════════════════════════╣');

  for (const config of configs) {
    const trainingLimit = config.maxTrainingSessions === null ? '∞ (Unlimited)' : config.maxTrainingSessions.toString();
    const recordingLimit = config.maxRecordingAnalyses === null ? '∞ (Unlimited)' : config.maxRecordingAnalyses.toString();
    const status = config.isActive ? '✓ Active' : '✗ Inactive';

    console.log(`║                                                                    ║`);
    console.log(`║  Tier: ${config.tier.padEnd(60)} ║`);
    console.log(`║  Status: ${status.padEnd(58)} ║`);
    console.log(`║  Max Training Sessions: ${trainingLimit.padEnd(45)} ║`);
    console.log(`║  Max Recording Analyses: ${recordingLimit.padEnd(44)} ║`);
    if (config.description) {
      console.log(`║  Description: ${config.description.padEnd(53)} ║`);
    }
    console.log(`║  Last Updated: ${config.updatedAt.toISOString().padEnd(50)} ║`);
  }

  console.log('╚════════════════════════════════════════════════════════════════════╝\n');
}

async function main() {
  try {
    await viewTierLimits();
  } catch (error) {
    logger.error({ error }, 'Failed to fetch tier limits');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
