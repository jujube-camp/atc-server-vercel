#!/usr/bin/env tsx
/**
 * Export data from Prisma database to JSON or CSV format
 * 
 * Usage:
 *   tsx scripts/export_data.ts --model User --format json
 *   tsx scripts/export_data.ts --model Airport --format csv --output airports.csv
 *   tsx scripts/export_data.ts --all --format json --output all_data.json
 */

import { prisma } from '../src/utils/prisma.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(__filename);

interface ExportOptions {
  model?: string;
  format: 'json' | 'csv';
  output?: string;
  all?: boolean;
}

function convertToCSV(data: any[]): string {
  if (data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const headerRow = headers.join(',');
  
  const rows = data.map(row => {
    return headers.map(header => {
      const value = row[header];
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value).replace(/"/g, '""');
      return String(value).replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, '');
    }).map(v => `"${v}"`).join(',');
  });
  
  return [headerRow, ...rows].join('\n');
}

async function exportModel(modelName: string, format: 'json' | 'csv', outputPath?: string): Promise<void> {
  console.log(`[${new Date().toISOString()}] Exporting ${modelName}...`);
  
  let data: any[];
  
  switch (modelName.toLowerCase()) {
    case 'user':
    case 'users':
      data = await prisma.user.findMany();
      break;
    case 'session':
    case 'sessions':
      data = await prisma.session.findMany({
        include: {
          user: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
        },
      });
      break;
    case 'transmissionevent':
    case 'transmission_events':
      data = await prisma.transmissionEvent.findMany({
        include: {
          session: {
            select: {
              id: true,
              airportIcao: true,
              aircraftTailNumber: true,
            },
          },
          evaluation: true,
        },
      });
      break;
    case 'phaseadvanceevent':
    case 'phase_advance_events':
      data = await prisma.phaseAdvanceEvent.findMany({
        include: {
          session: {
            select: {
              id: true,
              airportIcao: true,
              aircraftTailNumber: true,
            },
          },
        },
      });
      break;
    case 'evaluation':
    case 'evaluations':
      data = await prisma.evaluation.findMany({
        include: {
          transmissionEvent: {
            select: {
              id: true,
              sessionId: true,
              sender: true,
              current_phase: true,
            },
          },
        },
      });
      break;
    case 'airport':
    case 'airports':
      data = await prisma.airport.findMany();
      break;
    case 'referralcode':
    case 'referral_codes':
      data = await prisma.referralCode.findMany({
        include: {
          owner: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
        },
      });
      break;
    default:
      throw new Error(`Unknown model: ${modelName}`);
  }
  
  console.log(`  Found ${data.length} records`);
  
  const defaultFileName = `${modelName}_${new Date().toISOString().split('T')[0]}.${format}`;
  const filePath = outputPath || path.join(SCRIPT_DIR, 'exports', defaultFileName);
  
  // Ensure output directory exists
  const outputDir = path.dirname(filePath);
  await fs.mkdir(outputDir, { recursive: true });
  
  let content: string;
  if (format === 'json') {
    content = JSON.stringify(data, null, 2);
  } else {
    content = convertToCSV(data);
  }
  
  await fs.writeFile(filePath, content, 'utf-8');
  
  const sizeMB = (content.length / (1024 * 1024)).toFixed(2);
  console.log(`[${new Date().toISOString()}] Exported to ${filePath} (${sizeMB} MB)`);
}

async function exportAll(format: 'json' | 'csv', outputPath?: string): Promise<void> {
  console.log(`[${new Date().toISOString()}] Exporting all data...`);
  
  const allData = {
    users: await prisma.user.findMany(),
    sessions: await prisma.session.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
      },
    }),
    transmissionEvents: await prisma.transmissionEvent.findMany({
      include: {
        session: {
          select: {
            id: true,
            airportIcao: true,
            aircraftTailNumber: true,
          },
        },
        evaluation: true,
      },
    }),
    phaseAdvanceEvents: await prisma.phaseAdvanceEvent.findMany({
      include: {
        session: {
          select: {
            id: true,
            airportIcao: true,
            aircraftTailNumber: true,
          },
        },
      },
    }),
    evaluations: await prisma.evaluation.findMany({
      include: {
        transmissionEvent: {
          select: {
            id: true,
            sessionId: true,
            sender: true,
            current_phase: true,
          },
        },
      },
    }),
    airports: await prisma.airport.findMany(),
    referralCodes: await prisma.referralCode.findMany({
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
      },
    }),
  };
  
  const totalRecords = Object.values(allData).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`  Total records: ${totalRecords}`);
  
  const defaultFileName = `all_data_${new Date().toISOString().split('T')[0]}.${format}`;
  const filePath = outputPath || path.join(SCRIPT_DIR, 'exports', defaultFileName);
  
  // Ensure output directory exists
  const outputDir = path.dirname(filePath);
  await fs.mkdir(outputDir, { recursive: true });
  
  let content: string;
  if (format === 'json') {
    content = JSON.stringify(allData, null, 2);
  } else {
    // For CSV, export each model as a separate section
    const csvSections = Object.entries(allData).map(([modelName, data]) => {
      const csv = convertToCSV(data);
      return `=== ${modelName} ===\n${csv}`;
    });
    content = csvSections.join('\n\n');
  }
  
  await fs.writeFile(filePath, content, 'utf-8');
  
  const sizeMB = (content.length / (1024 * 1024)).toFixed(2);
  console.log(`[${new Date().toISOString()}] Exported to ${filePath} (${sizeMB} MB)`);
}

async function main() {
  const args = process.argv.slice(2);
  
  const options: ExportOptions = {
    format: 'json',
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--model' && args[i + 1]) {
      options.model = args[i + 1];
      i++;
    } else if (arg === '--format' && args[i + 1]) {
      options.format = args[i + 1] as 'json' | 'csv';
      i++;
    } else if (arg === '--output' && args[i + 1]) {
      options.output = args[i + 1];
      i++;
    } else if (arg === '--all') {
      options.all = true;
    }
  }
  
  try {
    if (options.all) {
      await exportAll(options.format, options.output);
    } else if (options.model) {
      await exportModel(options.model, options.format, options.output);
    } else {
      console.error('Usage:');
      console.error('  tsx scripts/export_data.ts --model <modelName> [--format json|csv] [--output <path>]');
      console.error('  tsx scripts/export_data.ts --all [--format json|csv] [--output <path>]');
      console.error('');
      console.error('Available models:');
      console.error('  - user, users');
      console.error('  - session, sessions');
      console.error('  - transmissionevent, transmission_events');
      console.error('  - phaseadvanceevent, phase_advance_events');
      console.error('  - evaluation, evaluations');
      console.error('  - airport, airports');
      console.error('  - referralcode, referral_codes');
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

