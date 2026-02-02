/**
 * AtcAgentService Regression Tests - Ground Operations
 * 
 * Covers: PARKING_STARTUP, TAXI_OUT, TAXI_BACK
 * Plus Edge Cases and Frequency checks
 */

import { describe, it, beforeAll, afterAll } from 'vitest';
import { AtcAgentService } from '../services/atcAgentService.js';
import pino from 'pino';
import { 
  buildTestContext, 
  validateResponse, 
  type AtcAgentTestCase, 
  type TimingData 
} from './utils/atc-agent-test-utils.js';
import {
  createSessionHistory,
  createTransmissionEvent,
} from './utils/test-helpers.js';

// Test logger
const logger = pino({
  level: process.env.TEST_LOG_LEVEL || 'silent',
  transport: process.env.TEST_LOG_LEVEL ? { target: 'pino-pretty' } : undefined,
});

const TEST_CASES: AtcAgentTestCase[] = [
  // =========================================================================
  // PARKING_STARTUP PHASE
  // =========================================================================
  {
    name: 'PARKING_STARTUP - Initial ATIS request',
    description: 'Pilot requests taxi without ATIS, ATC should ask for ATIS',
    context: buildTestContext(
      'PARKING_STARTUP',
      [],
      'San Jose Ground, Cessna November One Two Three Alpha Bravo, ready to taxi.',
      { userSelectedFrequencyType: 'GND' }
    ),
    expectations: {
      shouldRespond: true,
      messagePatterns: [
        /information|ATIS/i,
        /one two three alpha bravo/i,
      ],
      forbiddenPatterns: [
        /\[.*\]/,  // No brackets
        /\{.*\}/,  // No braces
        /TBD|TODO|XXX/i,  // No placeholders
      ],
      minLength: 10,
    },
  },
  {
    name: 'PARKING_STARTUP - Complete ATIS and taxi request',
    description: 'Pilot reports ATIS and requests taxi, ATC should issue taxi clearance',
    context: buildTestContext(
      'PARKING_STARTUP',
      [],
      'San Jose Ground, Cessna November One Two Three Alpha Bravo, with information Alpha, ready to taxi.',
      { userSelectedFrequencyType: 'GND' }
    ),
    expectations: {
      shouldRespond: true,
      messagePatterns: [
        /San Jose Ground/i,
        /taxi/i,
        /runway.*three.*zero/i,
        /one two three alpha bravo/i,
      ],
      forbiddenPatterns: [
        /\[.*\]/,
        /\{.*\}/,
        /TBD/i,
      ],
      minLength: 15,
    },
  },
  {
    name: 'PARKING_STARTUP - Correct readback',
    description: 'Pilot correctly reads back taxi clearance, ATC should stay silent',
    context: buildTestContext(
      'PARKING_STARTUP',
      createSessionHistory([
        createTransmissionEvent('San Jose Ground, Cessna November One Two Three Alpha Bravo, with information Alpha, ready to taxi.', 'PILOT', 'PARKING_STARTUP'),
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, San Jose Ground, taxi to runway three zero left via Hotel, Zulu, hold short runway three zero left.', 'GND', 'PARKING_STARTUP'),
      ]),
      'Taxi to runway three zero left via Hotel, Zulu, hold short runway three zero left, Cessna One Two Three Alpha Bravo.',
      { userSelectedFrequencyType: 'GND' }
    ),
    expectations: {
      shouldRespond: false,
    },
  },
  {
    name: 'PARKING_STARTUP - Missing callsign',
    description: 'Pilot transmits without callsign, ATC should request it',
    context: buildTestContext(
      'PARKING_STARTUP',
      [],
      'Ready to taxi.',
      { userSelectedFrequencyType: 'GND' }
    ),
    expectations: {
      shouldRespond: true,
      messagePatterns: [
        /aircraft calling|say callsign/i,
      ],
      forbiddenPatterns: [/\[.*\]/, /\{.*\}/],
      minLength: 5,
    },
  },
  {
    name: 'PARKING_STARTUP - Incomplete readback',
    description: 'Pilot reads back partially, ATC should correct or confirm',
    context: buildTestContext(
      'PARKING_STARTUP',
      createSessionHistory([
        createTransmissionEvent('San Jose Ground, Cessna November One Two Three Alpha Bravo, with information Alpha, ready to taxi.', 'PILOT', 'PARKING_STARTUP'),
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, taxi to runway three zero left via Hotel, Zulu, hold short runway three zero left.', 'GND', 'PARKING_STARTUP'),
      ]),
      'Taxi to runway three zero left, Cessna One Two Three Alpha Bravo.',
      { userSelectedFrequencyType: 'GND' }
    ),
    expectations: {
      shouldRespond: true,
      messagePatterns: [/hold short|Zulu|taxiway|route|missing/i],
      minLength: 10,
    },
  },

  // =========================================================================
  // TAXI_OUT PHASE
  // =========================================================================
  {
    name: 'TAXI_OUT - Handoff to Tower',
    description: 'Pilot reports nearing the runway, Ground should hand off to Tower',
    context: buildTestContext(
      'TAXI_OUT',
      createSessionHistory([
        createTransmissionEvent('San Jose Ground, Cessna One Two Three Alpha Bravo, taxiing to runway three zero left via Hotel.', 'PILOT', 'TAXI_OUT'),
      ]),
      'Ground, Cessna One Two Three Alpha Bravo, approaching holding point runway three zero left.',
      { userSelectedFrequencyType: 'GND' }
    ),
    expectations: {
      shouldRespond: true,
      messagePatterns: [
        /(contact|monitor).*tower/i,
        /(one.*two.*four.*point.*zero|124.*0|one.*one.*niner.*point.*seven|119.*7)/i, // Allow 124.0 (from config) or 119.7 (from examples)
      ],
      forbiddenPatterns: [/\[.*\]/, /\{.*\}/],
      minLength: 10,
    },
  },
  {
    name: 'TAXI_OUT - Handoff readback',
    description: 'Pilot correctly reads back tower frequency handoff, ATC should stay silent',
    context: buildTestContext(
      'TAXI_OUT',
      createSessionHistory([
        createTransmissionEvent('Ground, Cessna One Two Three Alpha Bravo, approaching holding point runway three zero left.', 'PILOT', 'TAXI_OUT'),
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, contact Tower on one two four point zero.', 'GND', 'TAXI_OUT'),
      ]),
      'Contact Tower one two four point zero, Cessna One Two Three Alpha Bravo.',
      { userSelectedFrequencyType: 'GND' }
    ),
    expectations: {
      shouldRespond: false,
    },
  },

  // =========================================================================
  // TAXI_BACK PHASE
  // =========================================================================
  {
    name: 'TAXI_BACK - Taxi to parking request',
    description: 'Pilot requests taxi to parking, Ground should issue taxi route',
    context: buildTestContext(
      'TAXI_BACK',
      createSessionHistory([
        createTransmissionEvent('Turn left at Bravo, contact Ground point seven, Cessna One Two Three Alpha Bravo.', 'PILOT', 'TAXI_BACK'),
      ]),
      'San Jose Ground, Cessna One Two Three Alpha Bravo, request taxi to parking.',
      { userSelectedFrequencyType: 'GND' }
    ),
    expectations: {
      shouldRespond: true,
      messagePatterns: [
        /taxi/i,
        /(via|parking|ramp)/i,
      ],
      forbiddenPatterns: [/\[.*\]/, /\{.*\}/],
      minLength: 10,
    },
  },

  // =========================================================================
  // EDGE CASES
  // =========================================================================
  {
    name: 'EDGE - Garbled transmission',
    description: 'Unintelligible transmission, ATC should request clarification',
    context: buildTestContext(
      'PARKING_STARTUP',
      [],
      '[UNTRANSCRIBABLE]',
      { userSelectedFrequencyType: 'GND' }
    ),
    expectations: {
      shouldRespond: true,
      messagePatterns: [/(say|repeat|unable)/i],
      forbiddenPatterns: [/\[.*\]/, /\{.*\}/],
      minLength: 5,
    },
  },
  {
    name: 'FREQUENCY - Pilot calls Tower on Ground frequency',
    description: 'Pilot says "Tower" but is on Ground frequency, Ground should redirect',
    context: buildTestContext(
      'HOLD_SHORT',
      [],
      'San Jose Tower, Cessna One Two Three Alpha Bravo, holding short runway three zero left, ready for departure',
      { userSelectedFrequencyType: 'GND', triggerType: 'pilot_speech' }
    ),
    expectations: {
      shouldRespond: true,
      messagePatterns: [
        /(aircraft calling|on.*frequency|correct.*frequency|on.*ground)/i,
        /(ground.*frequency|contact.*tower)/i,
        /one.*two.*four/i,
      ],
      forbiddenPatterns: [/\[.*\]/, /\{.*\}/],
      minLength: 15,
    },
  },
  {
    name: 'FREQUENCY - Pilot calls Ground on Tower frequency',
    description: 'Pilot says "Ground" but is on Tower frequency, Tower should correct',
    context: buildTestContext(
      'ROLLOUT',
      createSessionHistory([
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, runway three zero left, cleared to land', 'TWR', 'SHORT_FINAL'),
      ]),
      'San Jose Ground, Cessna One Two Three Alpha Bravo, clear of runway three zero left',
      { userSelectedFrequencyType: 'TWR', triggerType: 'pilot_speech' }
    ),
    expectations: {
      shouldRespond: true,
      messagePatterns: [
        /(aircraft calling|on.*frequency|correct.*frequency)/i,
        /(tower.*frequency|contact.*ground)/i,
      ],
      forbiddenPatterns: [/\[.*\]/, /\{.*\}/],
      minLength: 10,
    },
  },
  {
    name: 'FREQUENCY - Correct frequency with proper call',
    description: 'Pilot on correct frequency (Tower for HOLD_SHORT), should process normally',
    context: buildTestContext(
      'HOLD_SHORT',
      [],
      'San Jose Tower, Cessna One Two Three Alpha Bravo, holding short runway three zero left, ready for departure',
      { userSelectedFrequencyType: 'TWR', triggerType: 'pilot_speech' }
    ),
    expectations: {
      shouldRespond: true,
      messagePatterns: [
        /(line up and wait|cleared for takeoff)/i,
        /runway.*three.*zero/i,
      ],
      forbiddenPatterns: [/frequency|wrong/i],
      minLength: 10,
    },
  },
  {
    name: 'FREQUENCY - UNKNOWN frequency with departure request',
    description: 'Pilot requests departure on UNKNOWN frequency, ATC should instruct to contact Tower instead of pretending to be Tower',
    context: buildTestContext(
      'PARKING_STARTUP',
      [],
      'San Jose Ground, Cessna one two three Lima Bravo, at parking, request taxi for downwind departure with information Whiskey.',
      { userSelectedFrequencyType: 'UNKNOWN', triggerType: 'pilot_speech' }
    ),
    expectations: {
      shouldRespond: true,
      messagePatterns: [
        /ground/i,
      ],
      forbiddenPatterns: [
        /\[.*\]/,
        /\{.*\}/,
        /cleared for takeoff|line up and wait|taxi/i, // Should not issue clearances, should redirect
      ],
      minLength: 10,
    },
  },
];

describe('AtcAgentService Regression Tests - Ground', () => {
  const timings: TimingData[] = [];

  beforeAll(() => {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY must be set for regression tests');
    }
  });

  afterAll(() => {
    if (timings.length > 0) {
      const durations = timings.map(t => t.durationMs);
      const average = durations.reduce((sum, d) => sum + d, 0) / durations.length;
      console.log(`Ground Tests: ${timings.length} tests, Average duration: ${average.toFixed(2)}ms`);
    }
  });

  for (const testCase of TEST_CASES) {
    it(testCase.name, async () => {
      const startTime = Date.now();
      const response = await AtcAgentService.generateAtcResponse(
        testCase.context,
        logger
      );
      const durationMs = Date.now() - startTime;
      timings.push({ testName: testCase.name, durationMs });
      validateResponse(testCase, response);
    }, 30000);
  }
});

