#!/usr/bin/env tsx
/**
 * Seed flashcard exercises from scripts/data/flashcard.json into Neon Postgres.
 * Generates TTS via Fish Audio (voice 1 = ATC, voice 2 = sample response),
 * uploads audio to Vercel Blob, then inserts records.
 *
 * Usage:  npx tsx scripts/seed-flashcards.ts
 *         SEED_START_INDEX=23 npx tsx scripts/seed-flashcards.ts   # resume from 0-based index 23
 *
 * Requires: DATABASE_URL, FISH_AUDIO_API_KEY, BLOB_READ_WRITE_TOKEN,
 *           FISH_AUDIO_REFERENCE_ID (voice 1), FISH_AUDIO_REFERENCE_ID_VOICE_2 (voice 2)
 */

import dotenvFlow from 'dotenv-flow';
dotenvFlow.config({ default_node_env: 'development', silent: true });

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { FishAudioService } from '../src/services/fishAudioService.js';
import { BlobService } from '../src/services/blobService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

// ── Types (match flashcard.json) ────────────────────────────────────

interface FlashcardJsonItem {
  phase: string;
  difficulty: string;
  scenarioContext?: string;
  atcText: string;
  sampleResponse: string;
}

// ── Load flashcard.json ──────────────────────────────────────────────

function loadFlashcardJson(): FlashcardJsonItem[] {
  const path = join(__dirname, 'data', 'flashcard.json');
  const raw = readFileSync(path, 'utf-8');
  const data = JSON.parse(raw) as FlashcardJsonItem[];
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('flashcard.json must be a non-empty array');
  }
  return data;
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const fishApiKey = process.env.FISH_AUDIO_API_KEY;
  const voice1RefId = process.env.FISH_AUDIO_REFERENCE_ID;
  const voice2RefId = process.env.FISH_AUDIO_REFERENCE_ID_VOICE_2;

  if (!fishApiKey) throw new Error('FISH_AUDIO_API_KEY is required');
  if (!voice1RefId) throw new Error('FISH_AUDIO_REFERENCE_ID (voice 1) is required');
  if (!voice2RefId) throw new Error('FISH_AUDIO_REFERENCE_ID_VOICE_2 (voice 2) is required');

  FishAudioService.setApiKey(fishApiKey);

  const items = loadFlashcardJson();
  const startIndex = Math.max(0, parseInt(process.env.SEED_START_INDEX ?? '0', 10) || 0);
  const rawEnd = process.env.SEED_END_INDEX;
  const endIndex = rawEnd !== undefined && rawEnd !== ''
    ? Math.min(items.length, parseInt(rawEnd, 10) + 1) // SEED_END_INDEX is inclusive
    : items.length;
  const toProcess = Math.max(0, endIndex - startIndex);
  console.log(`\n🃏 Seeding flashcard exercises from flashcard.json (index ${startIndex} to ${endIndex - 1}, ${toProcess} items)…\n`);

  let created = 0;
  let skipped = 0;

  for (let i = startIndex; i < endIndex; i++) {
    const item = items[i];
    const topic = item.phase;
    const displayOrder = i + 1;

    // Idempotency: skip if same topic + atcText already exists
    const existing = await prisma.flashcardExercise.findFirst({
      where: {
        topic,
        content: { path: ['atcPromptText'], equals: item.atcText },
      },
    });

    const scenarioContext = item.scenarioContext || item.phase;

    if (existing) {
      // Update scenarioContext if it changed (e.g. after adding to JSON)
      const existingContent = existing.content as Record<string, unknown>;
      if (existingContent && existingContent.scenarioContext !== scenarioContext) {
        await prisma.flashcardExercise.update({
          where: { id: existing.id },
          data: {
            content: {
              ...(existingContent as object),
              scenarioContext,
            },
          },
        });
        console.log(`  📝 [${i + 1}/${items.length}] Updated scenarioContext`);
      } else {
        console.log(`  ⏭  [${i + 1}/${items.length}] ${topic.slice(0, 40)}… already exists — skipping`);
      }
      skipped++;
      continue;
    }

    const slug = topic
      .toLowerCase()
      .replace(/^phase \d+:?\s*/i, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 30);
    const prefix = `flashcards/${slug}-${String(displayOrder).padStart(3, '0')}`;

    // ATC prompt audio (voice 1)
    console.log(`  🔊 [${i + 1}/${items.length}] ATC (voice 1): "${item.atcText.slice(0, 50)}…"`);
    const { buffer: atcBuffer, format } = await FishAudioService.generateAudioWithBuffer({
      text: item.atcText,
      format: 'mp3',
      reference_id: voice1RefId,
    });
    const atcPathname = `${prefix}-atc.${format}`;
    const atcUrl = await BlobService.uploadAudio(atcPathname, atcBuffer, 'audio/mpeg');
    console.log(`     ☁️  ${atcPathname} (${atcBuffer.length} bytes)`);

    // Sample response audio (voice 2)
    console.log(`  🔊 [${i + 1}/${items.length}] Sample (voice 2): "${item.sampleResponse.slice(0, 50)}…"`);
    const { buffer: sampleBuffer } = await FishAudioService.generateAudioWithBuffer({
      text: item.sampleResponse,
      format: 'mp3',
      reference_id: voice2RefId,
    });
    const samplePathname = `${prefix}-sample.${format}`;
    const sampleUrl = await BlobService.uploadAudio(samplePathname, sampleBuffer, 'audio/mpeg');
    console.log(`     ☁️  ${samplePathname} (${sampleBuffer.length} bytes)`);

    await prisma.flashcardExercise.create({
      data: {
        topic,
        displayOrder,
        content: {
          scenarioContext,
          atcPromptText: item.atcText,
          atcPromptAudioUrl: atcUrl,
          sampleResponseText: item.sampleResponse,
          sampleResponseAudioUrl: sampleUrl,
          difficulty: item.difficulty as 'Easy' | 'Medium' | 'Hard',
        },
      },
    });

    console.log(`  ✅ [${i + 1}/${items.length}] Created\n`);
    created++;
  }

  console.log(`\n🏁 Done — ${created} created, ${skipped} skipped.\n`);
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
