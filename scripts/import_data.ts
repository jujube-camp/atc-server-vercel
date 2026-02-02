#!/usr/bin/env tsx
/**
 * Import data from JSON files into Prisma database
 * 
 * Usage:
 *   tsx scripts/import_data.ts --model User --input users.json
 *   tsx scripts/import_data.ts --model Airport --input airports.json
 *   tsx scripts/import_data.ts --all --input all_data.json
 *   tsx scripts/import_data.ts --all --input all_data.json --skip-existing
 */

import { prisma } from '../src/utils/prisma.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(__filename);

interface ImportOptions {
  model?: string;
  input: string;
  all?: boolean;
  skipExisting?: boolean;
  dryRun?: boolean;
}

interface ImportStats {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
}

/**
 * Clean nested relation data from records before import
 * This removes included relation data that was added during export
 */
function cleanRelationData(data: any, modelName: string): any {
  if (!data || typeof data !== 'object') return data;

  const cleaned = { ...data };

  switch (modelName.toLowerCase()) {
    case 'session':
    case 'sessions':
      delete cleaned.user;
      delete cleaned.phaseAdvanceEvents;
      delete cleaned.locationEvents;
      delete cleaned.transmissionEvents;
      delete cleaned.sessionState;
      break;
    case 'transmissionevent':
    case 'transmission_events':
      delete cleaned.session;
      delete cleaned.evaluation;
      break;
    case 'phaseadvanceevent':
    case 'phase_advance_events':
      delete cleaned.session;
      break;
    case 'evaluation':
    case 'evaluations':
      delete cleaned.transmissionEvent;
      break;
    case 'referralcode':
    case 'referral_codes':
      delete cleaned.owner;
      break;
    case 'user':
    case 'users':
      delete cleaned.sessions;
      delete cleaned.authSessions;
      delete cleaned.referralCodeRecord;
      delete cleaned.favoriteFeeds;
      delete cleaned.feedbacks;
      delete cleaned.recordings;
      delete cleaned.membership;
      break;
  }

  return cleaned;
}

/**
 * Import data for a specific model
 */
async function importModel(
  modelName: string,
  data: any[],
  options: ImportOptions
): Promise<ImportStats> {
  console.log(`[${new Date().toISOString()}] Importing ${modelName}...`);
  console.log(`  Records to import: ${data.length}`);

  const stats: ImportStats = {
    total: data.length,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
  };

  if (options.dryRun) {
    console.log(`  [DRY RUN] Would import ${data.length} records`);
    return stats;
  }

  for (const record of data) {
    try {
      const cleanedRecord = cleanRelationData(record, modelName);

      switch (modelName.toLowerCase()) {
        case 'user':
        case 'users':
          if (options.skipExisting) {
            const existing = await prisma.user.findUnique({
              where: { id: cleanedRecord.id },
            });
            if (existing) {
              stats.skipped++;
              continue;
            }
          }
          await prisma.user.upsert({
            where: { id: cleanedRecord.id },
            create: cleanedRecord,
            update: cleanedRecord,
          });
          break;

        case 'session':
        case 'sessions':
          if (options.skipExisting) {
            const existing = await prisma.session.findUnique({
              where: { id: cleanedRecord.id },
            });
            if (existing) {
              stats.skipped++;
              continue;
            }
          }
          await prisma.session.upsert({
            where: { id: cleanedRecord.id },
            create: cleanedRecord,
            update: cleanedRecord,
          });
          break;

        case 'transmissionevent':
        case 'transmission_events':
          if (options.skipExisting) {
            const existing = await prisma.transmissionEvent.findUnique({
              where: { id: cleanedRecord.id },
            });
            if (existing) {
              stats.skipped++;
              continue;
            }
          }
          await prisma.transmissionEvent.upsert({
            where: { id: cleanedRecord.id },
            create: cleanedRecord,
            update: cleanedRecord,
          });
          break;

        case 'phaseadvanceevent':
        case 'phase_advance_events':
          if (options.skipExisting) {
            const existing = await prisma.phaseAdvanceEvent.findUnique({
              where: { id: cleanedRecord.id },
            });
            if (existing) {
              stats.skipped++;
              continue;
            }
          }
          await prisma.phaseAdvanceEvent.upsert({
            where: { id: cleanedRecord.id },
            create: cleanedRecord,
            update: cleanedRecord,
          });
          break;

        case 'evaluation':
        case 'evaluations':
          if (options.skipExisting) {
            const existing = await prisma.evaluation.findUnique({
              where: { id: cleanedRecord.id },
            });
            if (existing) {
              stats.skipped++;
              continue;
            }
          }
          await prisma.evaluation.upsert({
            where: { id: cleanedRecord.id },
            create: cleanedRecord,
            update: cleanedRecord,
          });
          break;

        case 'airport':
        case 'airports':
          if (options.skipExisting) {
            const existing = await prisma.airport.findUnique({
              where: { id: cleanedRecord.id },
            });
            if (existing) {
              stats.skipped++;
              continue;
            }
          }
          await prisma.airport.upsert({
            where: { id: cleanedRecord.id },
            create: cleanedRecord,
            update: cleanedRecord,
          });
          break;

        case 'referralcode':
        case 'referral_codes':
          if (options.skipExisting) {
            const existing = await prisma.referralCode.findUnique({
              where: { id: cleanedRecord.id },
            });
            if (existing) {
              stats.skipped++;
              continue;
            }
          }
          await prisma.referralCode.upsert({
            where: { id: cleanedRecord.id },
            create: cleanedRecord,
            update: cleanedRecord,
          });
          break;

        case 'locationevent':
        case 'location_events':
          if (options.skipExisting) {
            const existing = await prisma.locationEvent.findUnique({
              where: { id: cleanedRecord.id },
            });
            if (existing) {
              stats.skipped++;
              continue;
            }
          }
          await prisma.locationEvent.upsert({
            where: { id: cleanedRecord.id },
            create: cleanedRecord,
            update: cleanedRecord,
          });
          break;

        case 'favoritefeed':
        case 'favorite_feeds':
          if (options.skipExisting) {
            const existing = await prisma.favoriteFeed.findUnique({
              where: { id: cleanedRecord.id },
            });
            if (existing) {
              stats.skipped++;
              continue;
            }
          }
          await prisma.favoriteFeed.upsert({
            where: { id: cleanedRecord.id },
            create: cleanedRecord,
            update: cleanedRecord,
          });
          break;

        case 'feedback':
          if (options.skipExisting) {
            const existing = await prisma.feedback.findUnique({
              where: { id: cleanedRecord.id },
            });
            if (existing) {
              stats.skipped++;
              continue;
            }
          }
          await prisma.feedback.upsert({
            where: { id: cleanedRecord.id },
            create: cleanedRecord,
            update: cleanedRecord,
          });
          break;

        case 'liveatcfeed':
        case 'liveatc_feeds':
          if (options.skipExisting) {
            const existing = await prisma.liveATCFeed.findUnique({
              where: { id: cleanedRecord.id },
            });
            if (existing) {
              stats.skipped++;
              continue;
            }
          }
          await prisma.liveATCFeed.upsert({
            where: { id: cleanedRecord.id },
            create: cleanedRecord,
            update: cleanedRecord,
          });
          break;

        case 'trainingmodeconfig':
        case 'training_mode_configs':
          if (options.skipExisting) {
            const existing = await prisma.trainingModeConfig.findUnique({
              where: { id: cleanedRecord.id },
            });
            if (existing) {
              stats.skipped++;
              continue;
            }
          }
          await prisma.trainingModeConfig.upsert({
            where: { id: cleanedRecord.id },
            create: cleanedRecord,
            update: cleanedRecord,
          });
          break;

        case 'aircrafttype':
        case 'aircraft_types':
          if (options.skipExisting) {
            const existing = await prisma.aircraftType.findUnique({
              where: { id: cleanedRecord.id },
            });
            if (existing) {
              stats.skipped++;
              continue;
            }
          }
          await prisma.aircraftType.upsert({
            where: { id: cleanedRecord.id },
            create: cleanedRecord,
            update: cleanedRecord,
          });
          break;

        case 'sessionstate':
        case 'session_states':
          if (options.skipExisting) {
            const existing = await prisma.sessionState.findUnique({
              where: { sessionId: cleanedRecord.sessionId },
            });
            if (existing) {
              stats.skipped++;
              continue;
            }
          }
          await prisma.sessionState.upsert({
            where: { sessionId: cleanedRecord.sessionId },
            create: cleanedRecord,
            update: cleanedRecord,
          });
          break;

        case 'recording':
        case 'recordings':
          if (options.skipExisting) {
            const existing = await prisma.recording.findUnique({
              where: { id: cleanedRecord.id },
            });
            if (existing) {
              stats.skipped++;
              continue;
            }
          }
          await prisma.recording.upsert({
            where: { id: cleanedRecord.id },
            create: cleanedRecord,
            update: cleanedRecord,
          });
          break;

        case 'membership':
        case 'memberships':
          if (options.skipExisting) {
            const existing = await prisma.membership.findUnique({
              where: { id: cleanedRecord.id },
            });
            if (existing) {
              stats.skipped++;
              continue;
            }
          }
          await prisma.membership.upsert({
            where: { id: cleanedRecord.id },
            create: cleanedRecord,
            update: cleanedRecord,
          });
          break;

        case 'membershipplan':
        case 'membership_plans':
          if (options.skipExisting) {
            const existing = await prisma.membershipPlan.findUnique({
              where: { id: cleanedRecord.id },
            });
            if (existing) {
              stats.skipped++;
              continue;
            }
          }
          await prisma.membershipPlan.upsert({
            where: { id: cleanedRecord.id },
            create: cleanedRecord,
            update: cleanedRecord,
          });
          break;

        case 'payment':
        case 'payments':
          if (options.skipExisting) {
            const existing = await prisma.payment.findUnique({
              where: { id: cleanedRecord.id },
            });
            if (existing) {
              stats.skipped++;
              continue;
            }
          }
          await prisma.payment.upsert({
            where: { id: cleanedRecord.id },
            create: cleanedRecord,
            update: cleanedRecord,
          });
          break;

        case 'usagerecord':
        case 'usage_records':
          if (options.skipExisting) {
            const existing = await prisma.usageRecord.findUnique({
              where: { id: cleanedRecord.id },
            });
            if (existing) {
              stats.skipped++;
              continue;
            }
          }
          await prisma.usageRecord.upsert({
            where: { id: cleanedRecord.id },
            create: cleanedRecord,
            update: cleanedRecord,
          });
          break;

        case 'authsession':
        case 'auth_sessions':
          if (options.skipExisting) {
            const existing = await prisma.authSession.findUnique({
              where: { id: cleanedRecord.id },
            });
            if (existing) {
              stats.skipped++;
              continue;
            }
          }
          await prisma.authSession.upsert({
            where: { id: cleanedRecord.id },
            create: cleanedRecord,
            update: cleanedRecord,
          });
          break;

        case 'tierlimitconfig':
        case 'tier_limit_configs':
          if (options.skipExisting) {
            const existing = await prisma.tierLimitConfig.findUnique({
              where: { id: cleanedRecord.id },
            });
            if (existing) {
              stats.skipped++;
              continue;
            }
          }
          await prisma.tierLimitConfig.upsert({
            where: { id: cleanedRecord.id },
            create: cleanedRecord,
            update: cleanedRecord,
          });
          break;

        default:
          throw new Error(`Unknown model: ${modelName}`);
      }

      if (options.skipExisting) {
        stats.created++;
      } else {
        stats.updated++;
      }
    } catch (error: any) {
      console.error(`  Failed to import record ${record.id}: ${error.message}`);
      stats.failed++;
    }
  }

  console.log(`  Created: ${stats.created}`);
  console.log(`  Updated: ${stats.updated}`);
  console.log(`  Skipped: ${stats.skipped}`);
  console.log(`  Failed: ${stats.failed}`);

  return stats;
}

/**
 * Import all data from a complete export file
 * Imports in the correct order to respect foreign key constraints
 */
async function importAll(data: any, options: ImportOptions): Promise<void> {
  console.log(`[${new Date().toISOString()}] Importing all data...`);

  const importOrder = [
    // Users first (no dependencies)
    { key: 'users', model: 'user' },
    // Then sessions (depends on users)
    { key: 'sessions', model: 'session' },
    // Then events (depend on sessions)
    { key: 'transmissionEvents', model: 'transmissionevent' },
    { key: 'phaseAdvanceEvents', model: 'phaseadvanceevent' },
    { key: 'locationEvents', model: 'locationevent' },
    // Evaluations (depend on transmission events)
    { key: 'evaluations', model: 'evaluation' },
    // Other independent tables
    { key: 'airports', model: 'airport' },
    { key: 'referralCodes', model: 'referralcode' },
    { key: 'favoriteFeeds', model: 'favoritefeed' },
    { key: 'feedbacks', model: 'feedback' },
    { key: 'liveATCFeeds', model: 'liveatcfeed' },
    { key: 'trainingModeConfigs', model: 'trainingmodeconfig' },
    { key: 'aircraftTypes', model: 'aircrafttype' },
    { key: 'sessionStates', model: 'sessionstate' },
    { key: 'recordings', model: 'recording' },
    { key: 'memberships', model: 'membership' },
    { key: 'membershipPlans', model: 'membershipplan' },
    { key: 'payments', model: 'payment' },
    { key: 'usageRecords', model: 'usagerecord' },
    { key: 'authSessions', model: 'authsession' },
    { key: 'tierLimitConfigs', model: 'tierlimitconfig' },
  ];

  const totalStats: ImportStats = {
    total: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
  };

  for (const { key, model } of importOrder) {
    if (data[key] && Array.isArray(data[key]) && data[key].length > 0) {
      const stats = await importModel(model, data[key], options);
      totalStats.total += stats.total;
      totalStats.created += stats.created;
      totalStats.updated += stats.updated;
      totalStats.skipped += stats.skipped;
      totalStats.failed += stats.failed;
    }
  }

  console.log(`\n[${new Date().toISOString()}] Import complete!`);
  console.log(`  Total records: ${totalStats.total}`);
  console.log(`  Created: ${totalStats.created}`);
  console.log(`  Updated: ${totalStats.updated}`);
  console.log(`  Skipped: ${totalStats.skipped}`);
  console.log(`  Failed: ${totalStats.failed}`);
}

async function main() {
  const args = process.argv.slice(2);

  const options: ImportOptions = {
    input: '',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--model' && args[i + 1]) {
      options.model = args[i + 1];
      i++;
    } else if (arg === '--input' && args[i + 1]) {
      options.input = args[i + 1];
      i++;
    } else if (arg === '--all') {
      options.all = true;
    } else if (arg === '--skip-existing') {
      options.skipExisting = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }

  if (!options.input) {
    console.error('Error: --input parameter is required');
    console.error('');
    console.error('Usage:');
    console.error('  tsx scripts/import_data.ts --model <modelName> --input <path>');
    console.error('  tsx scripts/import_data.ts --all --input <path>');
    console.error('');
    console.error('Options:');
    console.error('  --skip-existing    Skip records that already exist (only create new ones)');
    console.error('  --dry-run          Show what would be imported without making changes');
    console.error('');
    console.error('Available models:');
    console.error('  - user, users');
    console.error('  - session, sessions');
    console.error('  - transmissionevent, transmission_events');
    console.error('  - phaseadvanceevent, phase_advance_events');
    console.error('  - evaluation, evaluations');
    console.error('  - airport, airports');
    console.error('  - referralcode, referral_codes');
    console.error('  - locationevent, location_events');
    console.error('  - favoritefeed, favorite_feeds');
    console.error('  - feedback');
    console.error('  - liveatcfeed, liveatc_feeds');
    console.error('  - trainingmodeconfig, training_mode_configs');
    console.error('  - aircrafttype, aircraft_types');
    console.error('  - sessionstate, session_states');
    console.error('  - recording, recordings');
    console.error('  - membership, memberships');
    console.error('  - membershipplan, membership_plans');
    console.error('  - payment, payments');
    console.error('  - usagerecord, usage_records');
    console.error('  - authsession, auth_sessions');
    console.error('  - tierlimitconfig, tier_limit_configs');
    process.exit(1);
  }

  try {
    // Resolve input path
    const inputPath = path.isAbsolute(options.input)
      ? options.input
      : path.join(SCRIPT_DIR, options.input);

    console.log(`[${new Date().toISOString()}] Reading from ${inputPath}...`);

    // Read and parse JSON file
    const fileContent = await fs.readFile(inputPath, 'utf-8');
    const data = JSON.parse(fileContent);

    if (options.all) {
      await importAll(data, options);
    } else if (options.model) {
      if (!Array.isArray(data)) {
        throw new Error('Input file must contain an array of records for single model import');
      }
      await importModel(options.model, data, options);
    } else {
      console.error('Error: Either --model or --all must be specified');
      process.exit(1);
    }
  } catch (error: any) {
    console.error(`\n[${new Date().toISOString()}] Fatal error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
