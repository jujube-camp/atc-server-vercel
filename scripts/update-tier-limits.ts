#!/usr/bin/env tsx

/**
 * Script to update tier limit configurations in the database
 * 
 * Usage:
 *   pnpm tsx scripts/update-tier-limits.ts
 * 
 * This script allows you to modify usage limits for different membership tiers
 * without requiring code changes or redeployment.
 */

import { prisma } from '../src/utils/prisma.js';
import { logger } from '../src/utils/logger.js';

interface TierLimitConfig {
  tier: 'FREE' | 'PREMIUM';
  maxTrainingSessions: number | null;
  maxRecordingAnalyses: number | null;
  description: string;
}

// Configure your tier limits here
const tierLimits: TierLimitConfig[] = [
  {
    tier: 'FREE',
    maxTrainingSessions: null, // null = unlimited
    maxRecordingAnalyses: 1,   // 1 = one-time quota
    description: 'Free tier: unlimited training sessions, 1 recording analysis',
  },
  {
    tier: 'PREMIUM',
    maxTrainingSessions: null, // null = unlimited
    maxRecordingAnalyses: null, // null = unlimited
    description: 'Premium tier: unlimited training sessions and recording analyses',
  },
];

async function updateTierLimits() {
  logger.info('Starting tier limit configuration update...');

  for (const config of tierLimits) {
    try {
      const result = await prisma.tierLimitConfig.upsert({
        where: { tier: config.tier },
        update: {
          maxTrainingSessions: config.maxTrainingSessions,
          maxRecordingAnalyses: config.maxRecordingAnalyses,
          description: config.description,
          isActive: true,
          updatedAt: new Date(),
        },
        create: {
          tier: config.tier,
          maxTrainingSessions: config.maxTrainingSessions,
          maxRecordingAnalyses: config.maxRecordingAnalyses,
          description: config.description,
          isActive: true,
        },
      });

      logger.info(
        {
          tier: result.tier,
          maxTrainingSessions: result.maxTrainingSessions,
          maxRecordingAnalyses: result.maxRecordingAnalyses,
        },
        `Updated tier limit configuration for ${result.tier}`
      );
    } catch (error) {
      logger.error({ tier: config.tier, error }, `Failed to update tier limit for ${config.tier}`);
      throw error;
    }
  }

  logger.info('✅ All tier limit configurations updated successfully!');
}

async function main() {
  try {
    await updateTierLimits();
  } catch (error) {
    logger.error({ error }, 'Failed to update tier limits');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
