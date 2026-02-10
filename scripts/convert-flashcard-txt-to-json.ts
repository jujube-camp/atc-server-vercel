#!/usr/bin/env tsx
/**
 * Converts scripts/data/flashcard.txt to scripts/data/flashcard.json
 * Output: { phase, difficulty, atcText (from HarderAtcText only), sampleResponse }
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const inputPath = path.join(__dirname, 'data', 'flashcard.txt');
const outputPath = path.join(__dirname, 'data', 'flashcard.json');

const raw = fs.readFileSync(inputPath, 'utf-8');

// Phase header: "Phase 1: ATIS, Clearance Delivery, Initial Setup (10)"
const phaseRe = /^Phase (\d+): (.+?) \(\d+\)$/gm;

// Card block: tab, number, tab, "Difficulty: Easy|Medium|Hard"
// Then HarderAtcText: "..." and SampleResponse: "..."
// We'll split by lines and iterate, tracking current phase and parsing each card.
const lines = raw.split('\n');

interface Card {
  phase: string;
  difficulty: string;
  atcText: string;
  sampleResponse: string;
}

const cards: Card[] = [];
let currentPhase = '';

// Match quoted content (handles straight " and curly "" quotes)
function extractQuoted(s: string): string {
  const m = s.match(/[\u201C"]([^\u201D"]*?)[\u201D"]/);
  return m ? m[1].trim() : s.replace(/^(HarderAtcText|SampleResponse):\s*/, '').trim();
}

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const phaseMatch = line.match(/^Phase (\d+): (.+?) \(\d+\)$/);
  if (phaseMatch) {
    currentPhase = `Phase ${phaseMatch[1]}: ${phaseMatch[2].trim()}`;
    continue;
  }

  // Card start: "\t11.\tDifficulty: Easy" or "	11.	Difficulty: Easy"
  const cardMatch = line.match(/^\s*(\d+)\.\s*Difficulty:\s*(Easy|Medium|Hard)\s*$/);
  if (cardMatch && currentPhase) {
    const difficulty = cardMatch[2];
    let atcText = '';
    let sampleResponse = '';

    // Next non-empty lines should be scenarioContext, AtcText (easy), HarderAtcText, SampleResponse
    for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
      const l = lines[j];
      if (l.startsWith('HarderAtcText:')) {
        atcText = extractQuoted(l);
      } else if (l.startsWith('SampleResponse:')) {
        sampleResponse = extractQuoted(l);
        break;
      }
    }

    if (atcText || sampleResponse) {
      cards.push({ phase: currentPhase, difficulty, atcText, sampleResponse });
    }
  }
}

fs.writeFileSync(outputPath, JSON.stringify(cards, null, 2), 'utf-8');
console.log(`Wrote ${cards.length} cards to ${outputPath}`);
