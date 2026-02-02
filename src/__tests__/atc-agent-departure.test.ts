/**
 * AtcAgentService Regression Tests - Departure & Enroute
 * 
 * Covers: HOLD_SHORT, LINE_UP_AND_WAIT, CLIMBING, DEPARTURE, CRUISING
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
  // HOLD_SHORT PHASE
  // =========================================================================
  {
    name: 'HOLD_SHORT - Ready for departure',
    description: 'Pilot holding short and ready, Tower should issue LUAW or takeoff clearance',
    context: buildTestContext(
      'HOLD_SHORT',
      createSessionHistory([
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, contact Tower one one niner point seven.', 'GND', 'TAXI_OUT'),
        createTransmissionEvent('San Jose Tower, Cessna One Two Three Alpha Bravo, holding short runway three zero left, ready for departure.', 'PILOT', 'HOLD_SHORT'),
      ]),
      'San Jose Tower, Cessna One Two Three Alpha Bravo, holding short runway three zero left, ready for departure.',
      { userSelectedFrequencyType: 'TWR' }
    ),
    expectations: {
      shouldRespond: true,
      messagePatterns: [
        /runway.*three.*zero/i,
        /(line up and wait|cleared for takeoff)/i,
      ],
      forbiddenPatterns: [/\[.*\]/, /\{.*\}/],
      minLength: 10,
    },
  },
  {
    name: 'HOLD_SHORT - Takeoff clearance readback',
    description: 'Pilot correctly reads back takeoff clearance, ATC should stay silent',
    context: buildTestContext(
      'HOLD_SHORT',
      createSessionHistory([
        createTransmissionEvent('San Jose Tower, Cessna One Two Three Alpha Bravo, holding short runway three zero left, ready for departure.', 'PILOT', 'HOLD_SHORT'),
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, runway three zero left, cleared for takeoff.', 'TWR', 'HOLD_SHORT'),
      ]),
      'Runway three zero left, cleared for takeoff, Cessna One Two Three Alpha Bravo.',
      { userSelectedFrequencyType: 'TWR' }
    ),
    expectations: {
      shouldRespond: false,
    },
  },
  {
    name: 'HOLD_SHORT - Takeoff readback missing advisory wind only',
    description: 'Pilot repeats the clearance and callsign but omits the wind advisory',
    context: buildTestContext(
      'HOLD_SHORT',
      createSessionHistory([
        createTransmissionEvent('San Jose Tower, Cessna one two three lima bravo, holding short runway three zero right, ready for departure.', 'PILOT', 'HOLD_SHORT'),
        createTransmissionEvent('Cessna one two three lima bravo, runway three zero right, cleared for takeoff, fly runway heading, wind two niner zero at six.', 'TWR', 'HOLD_SHORT'),
      ]),
      'Runway three zero right, cleared for takeoff, runway heading, Cessna one two three Lima Bravo.',
      { userSelectedFrequencyType: 'CTAF/TWR' }
    ),
    expectations: {
      shouldRespond: false,
    },
  },
  {
    name: 'HOLD_SHORT - Missing callsign in readback',
    description: 'Pilot reads back without callsign, ATC should request callsign',
    context: buildTestContext(
      'HOLD_SHORT',
      createSessionHistory([
        createTransmissionEvent('San Jose Tower, Cessna One Two Three Alpha Bravo, holding short runway three zero left, ready for departure.', 'PILOT', 'HOLD_SHORT'),
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, runway three zero left, cleared for takeoff.', 'TWR', 'HOLD_SHORT'),
      ]),
      'Runway three zero left, cleared for takeoff.',
      { userSelectedFrequencyType: 'TWR' }
    ),
    expectations: {
      shouldRespond: true,
      messagePatterns: [/callsign/i],
      minLength: 5,
    },
  },
  {
    name: 'HOLD_SHORT - LUAW readback',
    description: 'Pilot correctly reads back line up and wait, ATC should stay silent',
    context: buildTestContext(
      'HOLD_SHORT',
      createSessionHistory([
        createTransmissionEvent('San Jose Tower, Cessna One Two Three Alpha Bravo, holding short runway three zero left, ready for departure.', 'PILOT', 'HOLD_SHORT'),
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, runway three zero left, line up and wait.', 'TWR', 'HOLD_SHORT'),
      ]),
      'Runway three zero left, line up and wait, Cessna One Two Three Alpha Bravo.',
      { userSelectedFrequencyType: 'TWR' }
    ),
    expectations: {
      shouldRespond: false,
    },
  },
  {
    name: 'HOLD_SHORT - Real KSJC holding short runway 30L',
    description: 'Real session data: pilot holding short runway 30L after taxi, Tower should issue LUAW or takeoff clearance',
    context: buildTestContext(
      'HOLD_SHORT',
      createSessionHistory([
        createTransmissionEvent('San Jose Ground, Cessna one two three Alpha Bravo at parking, request for pattern work with information Whiskey.', 'PILOT', 'PARKING_STARTUP', null, new Date('2025-11-17T20:48:19.375Z')),
        createTransmissionEvent('Cessna one two three alpha bravo, San Jose Ground, runway three zero right, taxi via alpha, zulu, hold short runway three zero right, squawk four six two three, departure frequency one two one point three, pattern work approved, advise ready for departure at the runway.', 'GND', 'PARKING_STARTUP', null, new Date('2025-11-17T20:48:24.122Z')),
        createTransmissionEvent('Taxi via Alpha Zulu, hold short Runway three zero right, squawk four six two three. And pattern work approved, Cessna one two three Alpha Bravo.', 'PILOT', 'PARKING_STARTUP', null, new Date('2025-11-17T20:49:01.401Z')),
      ]),
      'San Jose Tower, Cessna one two three Alpha Bravo holding short runway three zero right, ready for departure.',
      { userSelectedFrequencyType: 'CTAF/TWR' }
    ),
    expectations: {
      shouldRespond: true,
      messagePatterns: [
        /runway.*three.*zero/i,
        /(line up and wait|cleared for takeoff|traffic)/i,
      ],
      forbiddenPatterns: [/\[.*\]/, /\{.*\}/],
      minLength: 10,
    },
  },

  // =========================================================================
  // LINE_UP_AND_WAIT PHASE
  // =========================================================================
  {
    name: 'LINE_UP_AND_WAIT - Awaiting takeoff clearance',
    description: 'Pilot lined up, Tower should issue takeoff clearance',
    context: buildTestContext(
      'LINE_UP_AND_WAIT',
      createSessionHistory([
        createTransmissionEvent('Runway three zero left, line up and wait, Cessna One Two Three Alpha Bravo.', 'PILOT', 'LINE_UP_AND_WAIT'),
      ]),
      'Cessna One Two Three Alpha Bravo, lined up runway three zero left.',
      { userSelectedFrequencyType: 'TWR' }
    ),
    expectations: {
      shouldRespond: true,
      messagePatterns: [
        /cleared for takeoff/i,
        /runway.*three.*zero/i,
      ],
      forbiddenPatterns: [/\[.*\]/, /\{.*\}/],
      minLength: 10,
    },
  },
  {
    name: 'TOWER_INITIATE - LINE_UP_AND_WAIT phase entry',
    description: 'When entering LINE_UP_AND_WAIT phase (tower_initiate=true), Tower should proactively issue takeoff clearance',
    context: buildTestContext(
      'LINE_UP_AND_WAIT',
      createSessionHistory([
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, runway three zero left, line up and wait.', 'TWR', 'LINE_UP_AND_WAIT'),
        createTransmissionEvent('Runway three zero left, line up and wait, Cessna One Two Three Alpha Bravo.', 'PILOT', 'LINE_UP_AND_WAIT'),
      ]),
      'Phase advanced from HOLD_SHORT to LINE_UP_AND_WAIT',
      { userSelectedFrequencyType: 'TWR', triggerType: 'phase_entry' }
    ),
    expectations: {
      shouldRespond: true,
      messagePatterns: [
        /cleared for takeoff/i,
        /runway.*three.*zero/i,
        /(one two three alpha bravo|123AB)/i,
      ],
      forbiddenPatterns: [/\[.*\]/, /\{.*\}/, /TBD/i],
      minLength: 15,
    },
  },

  // =========================================================================
  // CLIMBING PHASE
  // =========================================================================
  {
    name: 'CLIMBING - Pattern entry instruction',
    description: 'After takeoff, Tower should issue pattern entry or departure instructions',
    context: buildTestContext(
      'CLIMBING',
      createSessionHistory([
        createTransmissionEvent('Runway three zero left, cleared for takeoff, Cessna One Two Three Alpha Bravo.', 'PILOT', 'CLIMBING'),
      ]),
      'Cessna One Two Three Alpha Bravo, passing through one thousand, climbing.',
      { userSelectedFrequencyType: 'TWR' }
    ),
    expectations: {
      shouldRespond: true,
      messagePatterns: [
        /(make.*traffic|closed traffic|pattern|departure)/i,
      ],
      forbiddenPatterns: [/\[.*\]/, /\{.*\}/],
      minLength: 10,
    },
  },
  {
    name: 'CLIMBING - Pattern entry acknowledgment',
    description: 'Pilot correctly acknowledges pattern entry, ATC should stay silent',
    context: buildTestContext(
      'CLIMBING',
      createSessionHistory([
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, make left closed traffic.', 'TWR', 'CLIMBING'),
      ]),
      'Make left closed traffic, Cessna One Two Three Alpha Bravo.',
      { userSelectedFrequencyType: 'TWR' }
    ),
    expectations: {
      shouldRespond: false,
    },
  },
  {
    name: 'TOWER_INITIATE - CLIMBING phase entry (pattern traffic)',
    description: 'When entering CLIMBING phase (tower_initiate=true), Tower should proactively issue pattern entry instructions',
    context: buildTestContext(
      'CLIMBING',
      createSessionHistory([
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, runway three zero left, cleared for takeoff.', 'TWR', 'CLIMBING'),
        createTransmissionEvent('Runway three zero left, cleared for takeoff, Cessna One Two Three Alpha Bravo.', 'PILOT', 'CLIMBING'),
      ]),
      'Phase advanced from LINE_UP_AND_WAIT to CLIMBING',
      { userSelectedFrequencyType: 'TWR', triggerType: 'phase_entry' }
    ),
    expectations: {
      shouldRespond: true,
      messagePatterns: [
        /(make.*traffic|closed traffic|pattern|left.*traffic|departure|contact.*departure)/i,
        /(one two three alpha bravo|123AB)/i,
      ],
      forbiddenPatterns: [/\[.*\]/, /\{.*\}/, /TBD/i],
      minLength: 15,
    },
  },
  {
    name: 'TOWER_INITIATE - CLIMBING phase entry (departure)',
    description: 'When entering CLIMBING phase for departing aircraft, Tower should hand off to Departure',
    context: buildTestContext(
      'CLIMBING',
      createSessionHistory([
        createTransmissionEvent('San Jose Tower, Cessna One Two Three Alpha Bravo, request straight out departure.', 'PILOT', 'CLIMBING'),
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, approved, runway three zero left, cleared for takeoff.', 'TWR', 'CLIMBING'),
        createTransmissionEvent('Runway three zero left, cleared for takeoff, Cessna One Two Three Alpha Bravo.', 'PILOT', 'CLIMBING'),
      ]),
      'Phase advanced from HOLD_SHORT to CLIMBING',
      { userSelectedFrequencyType: 'TWR', triggerType: 'phase_entry' }
    ),
    expectations: {
      shouldRespond: true,
      messagePatterns: [
        /(contact.*departure|departure.*frequency|make.*traffic|frequency change)/i,
      ],
      forbiddenPatterns: [/\[.*\]/, /\{.*\}/],
      minLength: 10,
    },
  },

  // =========================================================================
  // DEPARTURE PHASE
  // =========================================================================
  {
    name: 'DEPARTURE - Initial Check-in',
    description: 'Pilot checks in with Departure, ATC should acknowledge radar contact',
    context: buildTestContext(
      'DEPARTURE',
      createSessionHistory([
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, contact Departure on one two four point three.', 'TWR', 'CLIMBING'),
        createTransmissionEvent('Contact Departure one two four point three, Cessna One Two Three Alpha Bravo.', 'PILOT', 'CLIMBING'),
      ]),
      'Departure, Cessna One Two Three Alpha Bravo, passing one thousand five hundred for five thousand.',
      { userSelectedFrequencyType: 'DEP' }
    ),
    expectations: {
      shouldRespond: true,
      messagePatterns: [
        /(radar contact)/i,
        /(climb.*maintain)/i,
      ],
      forbiddenPatterns: [/\[.*\]/, /\{.*\}/],
      minLength: 10,
    },
  },
  {
    name: 'DEPARTURE - Radar contact readback',
    description: 'Pilot correctly reads back climb instructions, ATC should stay silent',
    context: buildTestContext(
      'DEPARTURE',
      createSessionHistory([
        createTransmissionEvent('Departure, Cessna One Two Three Alpha Bravo, passing one thousand five hundred for five thousand.', 'PILOT', 'DEPARTURE'),
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, radar contact, climb and maintain five thousand.', 'DEP', 'DEPARTURE'),
      ]),
      'Climb and maintain five thousand, Cessna One Two Three Alpha Bravo.',
      { userSelectedFrequencyType: 'DEP' }
    ),
    expectations: {
      shouldRespond: false,
    },
  },

  // =========================================================================
  // CRUISING PHASE
  // =========================================================================
  {
    name: 'CRUISING - Arrival Request',
    description: 'Pilot requests arrival instructions, Center/Departure should hand off to Approach OR give descent',
    context: buildTestContext(
      'CRUISING',
      createSessionHistory([
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, radar contact.', 'DEP', 'DEPARTURE'),
      ]),
      'Center, Cessna One Two Three Alpha Bravo, request descent for San Jose.',
      { userSelectedFrequencyType: 'CTR' }
    ),
    expectations: {
      shouldRespond: true,
      messagePatterns: [
        /(contact.*approach|expect.*runway|descend)/i,
      ],
      forbiddenPatterns: [/\[.*\]/, /\{.*\}/],
      minLength: 10,
    },
  },
  {
    name: 'CRUISING - Approach handoff readback',
    description: 'Pilot correctly reads back approach handoff, ATC should stay silent',
    context: buildTestContext(
      'CRUISING',
      createSessionHistory([
        createTransmissionEvent('Center, Cessna One Two Three Alpha Bravo, request descent for San Jose.', 'PILOT', 'CRUISING'),
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, contact NorCal Approach on one two zero point one.', 'CTR', 'CRUISING'),
      ]),
      'Contact NorCal Approach one two zero point one, Cessna One Two Three Alpha Bravo.',
      { userSelectedFrequencyType: 'CTR' }
    ),
    expectations: {
      shouldRespond: false,
    },
  },
];

describe('AtcAgentService Regression Tests - Departure', () => {
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
      console.log(`Departure Tests: ${timings.length} tests, Average duration: ${average.toFixed(2)}ms`);
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

