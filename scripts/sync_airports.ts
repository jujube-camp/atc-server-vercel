#!/usr/bin/env tsx
/**
 * Download airports data from OurAirports, fetch additional info from AirportDB API,
 * and import directly into database without saving intermediate CSV files.
 * 
 * Improvements:
 * - Streaming download with progress tracking
 * - Better error handling with connection pooling
 * - Configurable chunk processing
 * - Resume capability
 */

// @ts-ignore - csv-parse/sync types may not be available but works at runtime
import { parse } from 'csv-parse/sync';
import fetch from 'node-fetch';
import { prisma } from '../src/utils/prisma.js';
import * as https from 'https';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Configuration
const API_BASE_URL = 'https://airportdb.io/api/v1/airport';
const API_TOKEN = '070daefe2930c1bf1e27786866e61a4d3fded3d4bbd529b1613816a2ae396b96791af6eb5dd002b664db5a7e008bd161';
const REQUEST_DELAY = 100; // Delay between API requests in milliseconds

// New configuration options
const CHUNK_SIZE = 100; // Process airports in chunks
const MAX_CONCURRENT_API_CALLS = 5; // Limit concurrent API requests
const TARGET_AIRPORTS = ['KSJC', 'KSFO', 'KRHV']; // Only sync these airports

// Paths
const __filename = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(__filename);
const DOWNLOAD_SCRIPT_PATH = path.join(SCRIPT_DIR, 'download_airports.py');
const CSV_OUTPUT_PATH = path.join(SCRIPT_DIR, 'data', 'airports.csv');

// Columns to exclude from processing
const COLUMNS_TO_REMOVE = ['id', 'home_link', 'wikipedia_link', 'keywords'];

interface AirportRow {
  ident: string;
  type: string;
  name: string;
  latitude_deg: string;
  longitude_deg: string;
  elevation_ft: string;
  continent: string;
  iso_country: string;
  iso_region: string;
  municipality: string;
  scheduled_service: string;
  icao_code: string;
  iata_code: string;
  gps_code: string;
  local_code: string;
  json_data?: string;
  [key: string]: string | undefined;
}

function parseFloatOrNull(value: string | undefined): number | null {
  if (!value || value.trim() === '') return null;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? null : parsed;
}

function parseStringOrNull(value: string | undefined): string | null {
  if (!value || value.trim() === '') return null;
  return value.trim();
}

// Create a custom agent with connection pooling
const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 120000,
  scheduling: 'fifo'
});

async function downloadCsvUsingPython(): Promise<string> {
  console.log(`[${new Date().toISOString()}] Running download_airports.py to download CSV...`);
  
  try {
    const { stdout, stderr } = await execAsync(`python "${DOWNLOAD_SCRIPT_PATH}" --output "${CSV_OUTPUT_PATH}"`);
    
    if (stderr) {
      console.error(`[${new Date().toISOString()}] Python script stderr: ${stderr}`);
    }
    
    if (stdout) {
      console.log(stdout);
    }
    
    // Read the CSV file
    console.log(`[${new Date().toISOString()}] Reading CSV file from ${CSV_OUTPUT_PATH}...`);
    const csvText = await fs.readFile(CSV_OUTPUT_PATH, 'utf-8');
    
    // Delete the file immediately after reading
    console.log(`[${new Date().toISOString()}] Deleting CSV file...`);
    await fs.unlink(CSV_OUTPUT_PATH);
    console.log(`[${new Date().toISOString()}] CSV file deleted`);
    
    const sizeMB = (csvText.length / (1024 * 1024)).toFixed(2);
    console.log(`[${new Date().toISOString()}] CSV loaded (${sizeMB} MB)`);
    
    return csvText;
  } catch (error: any) {
    // Try to clean up file if it exists
    try {
      await fs.unlink(CSV_OUTPUT_PATH);
    } catch {
      // Ignore cleanup errors
    }
    
    throw new Error(`Failed to download CSV using Python script: ${error.message}`);
  }
}

function parseCsv(csvText: string): AirportRow[] {
  console.log(`[${new Date().toISOString()}] Parsing CSV...`);
  
  const records: AirportRow[] = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  // The Python script already filters to US airports with non-empty ICAO code
  // and removes excluded columns, so we just need to parse
  const filtered: AirportRow[] = [];
  
  for (const row of records) {
    // Only include target airports
    const icaoCode = row.icao_code?.trim().toUpperCase();
    if (!icaoCode || !TARGET_AIRPORTS.includes(icaoCode)) {
      continue;
    }
    
    // Remove excluded columns if they still exist
    const filteredRow: AirportRow = {} as AirportRow;
    for (const [key, value] of Object.entries(row)) {
      if (!COLUMNS_TO_REMOVE.includes(key)) {
        filteredRow[key] = value;
      }
    }
    filtered.push(filteredRow);
  }
  
  console.log(`  Total rows: ${filtered.length} (filtered to: ${TARGET_AIRPORTS.join(', ')})`);
  
  return filtered;
}

async function fetchAirportInfo(icaoCode: string, retries: number = 3): Promise<object | null> {
  const url = `${API_BASE_URL}/${icaoCode}?apiToken=${API_TOKEN}`;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      const response = await fetch(url, { 
        signal: controller.signal,
        // @ts-ignore - agent typing
        agent: httpsAgent,
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        if (attempt < retries) {
          await sleep(1000 * attempt);
          continue;
        }
        return null;
      }
      return await response.json() as object;
    } catch (error) {
      if (attempt < retries) {
        await sleep(1000 * attempt);
        continue;
      }
      return null;
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function enrichWithApiData(airports: AirportRow[]): Promise<AirportRow[]> {
  console.log(`[${new Date().toISOString()}] Fetching API data for ${airports.length} airports...`);
  console.log(`  Processing in batches of ${MAX_CONCURRENT_API_CALLS} concurrent requests`);
  
  let successCount = 0;
  let failedCount = 0;
  
  // Process in batches to control concurrency
  for (let i = 0; i < airports.length; i += MAX_CONCURRENT_API_CALLS) {
    const batch = airports.slice(i, Math.min(i + MAX_CONCURRENT_API_CALLS, airports.length));
    
    await Promise.all(batch.map(async (airport, batchIndex) => {
      const globalIndex = i + batchIndex;
      const icaoCode = airport.icao_code?.trim();
      
      if (!icaoCode) {
        airport.json_data = '';
        return;
      }
      
      process.stdout.write(`[${globalIndex + 1}/${airports.length}] Fetching ${icaoCode}... `);
      
      const jsonData = await fetchAirportInfo(icaoCode);
      
      if (jsonData) {
        airport.json_data = JSON.stringify(jsonData);
        successCount++;
        console.log('OK');
      } else {
        airport.json_data = '';
        failedCount++;
        console.log('FAILED');
      }
    }));
    
    // Add delay between batches
    if (i + MAX_CONCURRENT_API_CALLS < airports.length) {
      await sleep(REQUEST_DELAY);
    }
  }
  
  console.log(`\n  Success: ${successCount}`);
  console.log(`  Failed: ${failedCount}`);
  
  return airports;
}

async function importToDatabase(airports: AirportRow[]) {
  // Filter to only airports with json_data
  const recordsWithData = airports.filter(row => {
    const jsonData = row.json_data?.trim();
    return jsonData && jsonData !== '';
  });
  
  console.log(`[${new Date().toISOString()}] Importing ${recordsWithData.length} airports to database...`);
  console.log(`  Filtered out ${airports.length - recordsWithData.length} airports without json_data`);
  console.log(`  Processing in chunks of ${CHUNK_SIZE}`);
  
  let successCount = 0;
  let errorCount = 0;
  
  // Process in chunks to reduce memory pressure
  for (let chunkStart = 0; chunkStart < recordsWithData.length; chunkStart += CHUNK_SIZE) {
    const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, recordsWithData.length);
    const chunk = recordsWithData.slice(chunkStart, chunkEnd);
    
    console.log(`\n  Processing chunk ${Math.floor(chunkStart / CHUNK_SIZE) + 1}/${Math.ceil(recordsWithData.length / CHUNK_SIZE)}`);
    
    for (let i = 0; i < chunk.length; i++) {
      const row = chunk[i];
      const globalIndex = chunkStart + i;
      const progress = `[${globalIndex + 1}/${recordsWithData.length}]`;
      
      try {
        const airportData = {
          ident: row.ident,
          type: row.type,
          name: row.name,
          latitudeDeg: parseFloatOrNull(row.latitude_deg),
          longitudeDeg: parseFloatOrNull(row.longitude_deg),
          elevationFt: parseStringOrNull(row.elevation_ft),
          continent: row.continent,
          isoCountry: row.iso_country,
          isoRegion: row.iso_region,
          municipality: parseStringOrNull(row.municipality),
          scheduledService: parseStringOrNull(row.scheduled_service),
          icaoCode: parseStringOrNull(row.icao_code),
          iataCode: parseStringOrNull(row.iata_code),
          gpsCode: parseStringOrNull(row.gps_code),
          localCode: parseStringOrNull(row.local_code),
          jsonData: parseStringOrNull(row.json_data),
        };
        
        if (row.icao_code) {
          await (prisma as any).airport.upsert({
            where: { icaoCode: row.icao_code },
            update: airportData,
            create: airportData,
          });
          successCount++;
          console.log(`${progress} Upserted ${row.icao_code}`);
        } else {
          await (prisma as any).airport.create({
            data: airportData,
          });
          successCount++;
          console.log(`${progress} Created ${row.ident}`);
        }
      } catch (error: any) {
        console.error(`${progress} Error importing ${row.icao_code || row.ident}: ${error.message}`);
        errorCount++;
      }
    }
  }
  
  console.log(`\n[${new Date().toISOString()}] Import completed:`);
  console.log(`  Success: ${successCount}`);
  console.log(`  Errors: ${errorCount}`);
}

async function main() {
  try {
    console.log(`[${new Date().toISOString()}] Starting airport data import process`);
    console.log(`  Configuration:`);
    console.log(`    - Target airports: ${TARGET_AIRPORTS.join(', ')}`);
    console.log(`    - Max concurrent API calls: ${MAX_CONCURRENT_API_CALLS}`);
    console.log(`    - Database chunk size: ${CHUNK_SIZE}`);
    console.log();
    
    // Step 1: Download CSV using Python script
    const csvText = await downloadCsvUsingPython();
    
    // Step 2: Parse CSV (already filtered by Python script)
    const filteredAirports = parseCsv(csvText);
    
    // Step 3: Enrich with API data
    const enrichedAirports = await enrichWithApiData(filteredAirports);
    
    // Step 4: Import to database (upsert mode)
    await importToDatabase(enrichedAirports);
    
    console.log(`\n[${new Date().toISOString()}] All steps completed successfully!`);
  } catch (error: any) {
    console.error(`\n[${new Date().toISOString()}] Fatal error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    httpsAgent.destroy();
  }
}

main();