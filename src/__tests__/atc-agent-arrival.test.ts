/**
 * AtcAgentService Regression Tests - Arrival & Pattern
 * 
 * Covers: ARRIVAL, ENTER_AIRSPACE, PATTERN_ENTRY, TRAFFIC_PATTERN, 
 * STRAIGHT_IN, SHORT_FINAL, ROLLOUT, EMERGENCY
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
  createPhaseAdvanceEvent,
} from './utils/test-helpers.js';

// Test logger
const logger = pino({
  level: process.env.TEST_LOG_LEVEL || 'silent',
  transport: process.env.TEST_LOG_LEVEL ? { target: 'pino-pretty' } : undefined,
});

const TEST_CASES: AtcAgentTestCase[] = [
  // =========================================================================
  // ARRIVAL PHASE
  // =========================================================================
  {
    name: 'ARRIVAL - Inbound Sequencing',
    description: 'Pilot checks in with Approach, ATC should give sequencing/vectors',
    context: buildTestContext(
      'ARRIVAL',
      createSessionHistory([
         createTransmissionEvent('Cessna One Two Three Alpha Bravo, contact NorCal Approach.', 'CTR', 'CRUISING'),
         createTransmissionEvent('Switching to NorCal, Cessna One Two Three Alpha Bravo.', 'PILOT', 'CRUISING'),
      ]),
      'NorCal Approach, Cessna One Two Three Alpha Bravo, level four thousand with information Bravo.',
      { userSelectedFrequencyType: 'APP' }
    ),
    expectations: {
      shouldRespond: true,
      messagePatterns: [
        /(expect.*runway|fly.*heading|descend)/i,
      ],
      forbiddenPatterns: [/\[.*\]/, /\{.*\}/],
      minLength: 10,
    },
  },
  {
    name: 'ARRIVAL - Sequencing readback',
    description: 'Pilot correctly reads back sequencing instructions, ATC should stay silent',
    context: buildTestContext(
      'ARRIVAL',
      createSessionHistory([
        createTransmissionEvent('NorCal Approach, Cessna One Two Three Alpha Bravo, level four thousand with information Bravo.', 'PILOT', 'ARRIVAL'),
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, fly heading one eight zero, descend and maintain three thousand, expect Runway three zero left.', 'APP', 'ARRIVAL'),
      ]),
      'Heading one eight zero, down to three thousand, expect three zero left, Cessna One Two Three Alpha Bravo.',
      { userSelectedFrequencyType: 'APP' }
    ),
    expectations: {
      shouldRespond: false,
    },
  },

  // =========================================================================
  // ENTER_AIRSPACE PHASE
  // =========================================================================
  {
    name: 'ENTER_AIRSPACE - Tower Handoff/Pattern Entry',
    description: 'Pilot contacts Tower inbound, Tower should assign pattern entry',
    context: buildTestContext(
      'ENTER_AIRSPACE',
      createSessionHistory([
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, contact Tower one one niner point seven.', 'APP', 'ARRIVAL'),
        createTransmissionEvent('Tower one one niner point seven, Cessna One Two Three Alpha Bravo.', 'PILOT', 'ARRIVAL'),
      ]),
      'San Jose Tower, Cessna One Two Three Alpha Bravo, ten miles east, inbound for landing.',
      { userSelectedFrequencyType: 'TWR' }
    ),
    expectations: {
      shouldRespond: true,
      messagePatterns: [
        /(enter.*traffic|report.*downwind|straight.*in)/i,
        /runway.*three.*zero/i,
      ],
      forbiddenPatterns: [/\[.*\]/, /\{.*\}/],
      minLength: 10,
    },
  },
  {
    name: 'ENTER_AIRSPACE - Pattern entry readback',
    description: 'Pilot correctly reads back pattern entry, ATC should stay silent',
    context: buildTestContext(
      'ENTER_AIRSPACE',
      createSessionHistory([
        createTransmissionEvent('San Jose Tower, Cessna One Two Three Alpha Bravo, ten miles east, inbound for landing.', 'PILOT', 'ENTER_AIRSPACE'),
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, enter left traffic Runway three zero left, report midfield downwind.', 'TWR', 'ENTER_AIRSPACE'),
      ]),
      'Enter left traffic three zero left, report midfield, Cessna One Two Three Alpha Bravo.',
      { userSelectedFrequencyType: 'TWR' }
    ),
    expectations: {
      shouldRespond: false,
    },
  },
  {
    name: 'TOWER_INITIATE - ENTER_AIRSPACE phase entry',
    description: 'When entering ENTER_AIRSPACE phase (tower_initiate=true), Tower should proactively contact',
    context: buildTestContext(
      'ENTER_AIRSPACE',
      createSessionHistory([
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, contact Tower.', 'APP', 'ARRIVAL'),
        createTransmissionEvent('Contact Tower, Cessna One Two Three Alpha Bravo.', 'PILOT', 'ARRIVAL'),
      ]),
      'Phase advanced from ARRIVAL to ENTER_AIRSPACE',
      { userSelectedFrequencyType: 'TWR', triggerType: 'phase_entry' }
    ),
    expectations: {
      shouldRespond: true,
      messagePatterns: [
        /(enter.*traffic|straight.*in|report)/i,
      ],
      forbiddenPatterns: [/\[.*\]/, /\{.*\}/, /TBD/i],
      minLength: 10,
    },
  },

  // =========================================================================
  // TRAFFIC_PATTERN PHASE
  // =========================================================================
  {
    name: 'TRAFFIC_PATTERN - Report base readback',
    description: 'Pilot correctly reads back report base instruction while established in the pattern; ATC should stay silent',
    context: buildTestContext(
      'TRAFFIC_PATTERN',
      createSessionHistory([
        createTransmissionEvent('Left downwind runway three zero left, Cessna One Two Three Alpha Bravo.', 'PILOT', 'TRAFFIC_PATTERN'),
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, roger, report base.', 'TWR', 'TRAFFIC_PATTERN'),
      ]),
      'Report base, Cessna One Two Three Alpha Bravo.',
      { userSelectedFrequencyType: 'TWR' }
    ),
    expectations: {
      shouldRespond: false,
    },
  },
  {
    name: 'TRAFFIC_PATTERN - Downwind report',
    description: 'Pilot reports downwind, Tower should clear to land or sequence',
    context: buildTestContext(
      'TRAFFIC_PATTERN',
      createSessionHistory([
        createTransmissionEvent('Make left closed traffic, Cessna One Two Three Alpha Bravo.', 'PILOT', 'TRAFFIC_PATTERN'),
      ]),
      'San Jose Tower, Cessna One Two Three Alpha Bravo, left downwind, runway three zero left.',
      { userSelectedFrequencyType: 'TWR' }
    ),
    expectations: {
      shouldRespond: true,
      messagePatterns: [
        /(clear|number|sequence|extend|turn base)/i,
        /runway.*three.*zero/i,
      ],
      forbiddenPatterns: [/\[.*\]/, /\{.*\}/],
      minLength: 10,
    },
  },
  {
    name: 'TRAFFIC_PATTERN - Landing clearance readback',
    description: 'Pilot correctly reads back landing clearance, ATC should stay silent',
    context: buildTestContext(
      'TRAFFIC_PATTERN',
      createSessionHistory([
        createTransmissionEvent('San Jose Tower, Cessna One Two Three Alpha Bravo, left downwind, runway three zero left.', 'PILOT', 'TRAFFIC_PATTERN'),
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, runway three zero left, cleared to land.', 'TWR', 'TRAFFIC_PATTERN'),
      ]),
      'Runway three zero left, cleared to land, Cessna One Two Three Alpha Bravo.',
      { userSelectedFrequencyType: 'TWR' }
    ),
    expectations: {
      shouldRespond: false,
    },
  },
  {
    name: 'TOWER_INITIATE - TRAFFIC_PATTERN phase entry (from CLIMBING)',
    description: 'When entering TRAFFIC_PATTERN phase (tower_initiate=true), Tower should issue landing clearance or sequencing',
    context: buildTestContext(
      'TRAFFIC_PATTERN',
      createSessionHistory([
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, make left closed traffic.', 'TWR', 'TRAFFIC_PATTERN'),
        createTransmissionEvent('Make left closed traffic, Cessna One Two Three Alpha Bravo.', 'PILOT', 'TRAFFIC_PATTERN'),
      ]),
      'Phase advanced from CLIMBING to TRAFFIC_PATTERN',
      { userSelectedFrequencyType: 'TWR', triggerType: 'phase_entry' }
    ),
    expectations: {
      shouldRespond: true,
      messagePatterns: [
        /(land|option|number|sequence|report|turn base|extend)/i,
        /runway.*three.*zero/i,
      ],
      forbiddenPatterns: [/\[.*\]/, /\{.*\}/, /TBD/i],
      minLength: 15,
    },
  },
  {
    name: 'TOWER_INITIATE - TRAFFIC_PATTERN phase entry (from CRUISING)',
    description: 'When aircraft returns from cruise to pattern, Tower should issue landing clearance',
    context: buildTestContext(
      'TRAFFIC_PATTERN',
      createSessionHistory([
        createTransmissionEvent('San Jose Tower, Cessna One Two Three Alpha Bravo, ten miles north, inbound for landing with information Bravo.', 'PILOT', 'TRAFFIC_PATTERN'),
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, join left downwind runway three zero left.', 'TWR', 'TRAFFIC_PATTERN'),
        createTransmissionEvent('Join left downwind runway three zero left, Cessna One Two Three Alpha Bravo.', 'PILOT', 'TRAFFIC_PATTERN'),
      ]),
      'Phase advanced from CRUISING to TRAFFIC_PATTERN',
      { userSelectedFrequencyType: 'TWR', triggerType: 'phase_entry' }
    ),
    expectations: {
      shouldRespond: true,
      messagePatterns: [
        /(cleared to land|number|sequence|report)/i,
      ],
      forbiddenPatterns: [/\[.*\]/, /\{.*\}/],
      minLength: 10,
    },
  },

  // =========================================================================
  // STRAIGHT_IN PHASE
  // =========================================================================
  {
    name: 'STRAIGHT_IN - Landing Clearance',
    description: 'Pilot on straight-in final, Tower should clear to land',
    context: buildTestContext(
      'STRAIGHT_IN',
      createSessionHistory([
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, continue straight-in runway three zero left.', 'TWR', 'ENTER_AIRSPACE'),
        createTransmissionEvent('Continue straight-in three zero left, Cessna One Two Three Alpha Bravo.', 'PILOT', 'ENTER_AIRSPACE'),
      ]),
      'San Jose Tower, Cessna One Two Three Alpha Bravo, three mile final runway three zero left.',
      { userSelectedFrequencyType: 'TWR' }
    ),
    expectations: {
      shouldRespond: true,
      messagePatterns: [
        /(cleared to land)/i,
        /runway.*three.*zero/i,
      ],
      forbiddenPatterns: [/\[.*\]/, /\{.*\}/],
      minLength: 10,
    },
  },
  {
    name: 'STRAIGHT_IN - Landing clearance readback',
    description: 'Pilot correctly reads back landing clearance, ATC should stay silent',
    context: buildTestContext(
      'STRAIGHT_IN',
      createSessionHistory([
        createTransmissionEvent('San Jose Tower, Cessna One Two Three Alpha Bravo, three mile final runway three zero left.', 'PILOT', 'STRAIGHT_IN'),
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, runway three zero left, cleared to land.', 'TWR', 'STRAIGHT_IN'),
      ]),
      'Runway three zero left, cleared to land, Cessna One Two Three Alpha Bravo.',
      { userSelectedFrequencyType: 'TWR' }
    ),
    expectations: {
      shouldRespond: false,
    },
  },

  // =========================================================================
  // SHORT_FINAL PHASE
  // =========================================================================
  {
    name: 'SHORT_FINAL - Late check',
    description: 'Pilot reports short final, Tower should confirm or provide winds',
    context: buildTestContext(
      'SHORT_FINAL',
      createSessionHistory([
        createTransmissionEvent('Runway three zero left, cleared to land, Cessna One Two Three Alpha Bravo.', 'PILOT', 'STRAIGHT_IN'),
      ]),
      'Cessna One Two Three Alpha Bravo, short final.',
      { userSelectedFrequencyType: 'TWR' }
    ),
    expectations: {
      shouldRespond: false,
    },
  },

  // =========================================================================
  // ROLLOUT PHASE
  // =========================================================================
  {
    name: 'ROLLOUT - Exit and ground handoff',
    description: 'After landing, Tower should issue exit instructions and hand off to Ground',
    context: buildTestContext(
      'ROLLOUT',
      createSessionHistory([
        createPhaseAdvanceEvent('TRAFFIC_PATTERN', 'SHORT_FINAL'),
        createPhaseAdvanceEvent('SHORT_FINAL', 'ROLLOUT'),
        createTransmissionEvent('Runway three zero left, cleared to land, Cessna One Two Three Alpha Bravo.', 'PILOT', 'TRAFFIC_PATTERN'),
        createTransmissionEvent('Cessna one two three alpha bravo, Runway three zero left, cleared to land.', 'TWR', 'TRAFFIC_PATTERN'),
      ]),
      'Cessna One Two Three Alpha Bravo, clear of runway three zero left.',
      { userSelectedFrequencyType: 'TWR' }
    ),
    expectations: {
      shouldRespond: true,
      messagePatterns: [
        /(contact.*ground|turn.*taxiway|taxi.*ramp)/i,
      ],
      forbiddenPatterns: [/\[.*\]/, /\{.*\}/],
      minLength: 10,
    },
  },
  {
    name: 'ROLLOUT - Ground handoff readback',
    description: 'Pilot correctly reads back ground handoff, ATC should stay silent',
    context: buildTestContext(
      'ROLLOUT',
      createSessionHistory([
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, clear of runway three zero left.', 'PILOT', 'ROLLOUT'),
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, turn left at Bravo, contact Ground point seven.', 'TWR', 'ROLLOUT'),
      ]),
      'Turn left at Bravo, contact Ground point seven, Cessna One Two Three Alpha Bravo.',
      { userSelectedFrequencyType: 'TWR' }
    ),
    expectations: {
      shouldRespond: false,
    },
  },
  {
    name: 'ROLLOUT - Complete exit and ground handoff readback',
    description: 'Pilot correctly reads back complete exit and ground handoff instruction with all elements, ATC should stay silent',
    context: buildTestContext(
      'ROLLOUT',
      createSessionHistory([
        createTransmissionEvent('Cessna one two three lima bravo, turn left when able, exit via Bravo, contact Ground on one two one point seven for taxi to parking.', 'TWR', 'ROLLOUT'),
      ]),
      'Turn left and taxi via Bravo, contact ground on one two one point seven, Cessna one two three Lima Bravo.',
      { userSelectedFrequencyType: 'TWR' }
    ),
    expectations: {
      shouldRespond: false,
    },
  },
  {
    name: 'TOWER_INITIATE - ROLLOUT phase entry (from TRAFFIC_PATTERN)',
    description: 'When entering ROLLOUT phase (tower_initiate=true), Tower should issue exit instructions and ground handoff',
    context: buildTestContext(
      'ROLLOUT',
      createSessionHistory([
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, runway three zero left, cleared to land.', 'TWR', 'SHORT_FINAL'),
        createTransmissionEvent('Runway three zero left, cleared to land, Cessna One Two Three Alpha Bravo.', 'PILOT', 'SHORT_FINAL'),
      ]),
      'Phase advanced from SHORT_FINAL to ROLLOUT',
      { userSelectedFrequencyType: 'TWR', triggerType: 'phase_entry' }
    ),
    expectations: {
      shouldRespond: true,
      messagePatterns: [
        /(contact.*ground|turn.*taxiway|exit|alpha|bravo|charlie)/i,
        /(ground.*point.*seven|121.*7)/i, // Normalized: "121.7" becomes "121 7"
      ],
      forbiddenPatterns: [/\[.*\]/, /\{.*\}/, /TBD/i],
      minLength: 15,
    },
  },
  {
    name: 'TOWER_INITIATE - ROLLOUT phase entry (from EMERGENCY)',
    description: 'After emergency landing, Tower should provide exit instructions with awareness of emergency',
    context: buildTestContext(
      'ROLLOUT',
      createSessionHistory([
        createTransmissionEvent('San Jose Tower, Cessna One Two Three Alpha Bravo, emergency, engine failure.', 'PILOT', 'SHORT_FINAL'),
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, cleared to land any runway, emergency services standing by.', 'TWR', 'SHORT_FINAL'),
        createTransmissionEvent('Cleared to land, Cessna One Two Three Alpha Bravo.', 'PILOT', 'SHORT_FINAL'),
      ]),
      'Phase advanced from SHORT_FINAL to ROLLOUT',
      { userSelectedFrequencyType: 'TWR', triggerType: 'phase_entry' }
    ),
    expectations: {
      shouldRespond: true,
      messagePatterns: [
        /(contact.*ground|turn|exit|emergency.*services)/i,
      ],
      forbiddenPatterns: [/\[.*\]/, /\{.*\}/],
      minLength: 10,
    },
  },

  // =========================================================================
  // EMERGENCY PHASE
  // =========================================================================
  {
    name: 'TOWER_INITIATE - EMERGENCY phase entry (from CLIMBING)',
    description: 'When entering EMERGENCY phase (tower_initiate=true), Tower should provide emergency assistance',
    context: buildTestContext(
      'EMERGENCY',
      createSessionHistory([
        createTransmissionEvent('San Jose Tower, Cessna One Two Three Alpha Bravo, declaring emergency, engine failure, returning to field.', 'PILOT', 'EMERGENCY'),
      ]),
      'Phase advanced from CLIMBING to EMERGENCY',
      { userSelectedFrequencyType: 'TWR', triggerType: 'phase_entry' }
    ),
    expectations: {
      shouldRespond: true,
      messagePatterns: [
        /(cleared|any runway|say.*souls|fuel.*remaining|roger|emergency|squawk.*seven.*seven)/i,
      ],
      forbiddenPatterns: [/\[.*\]/, /\{.*\}/, /TBD/i],
      minLength: 15,
    },
  },
  {
    name: 'TOWER_INITIATE - EMERGENCY phase entry (from TRAFFIC_PATTERN)',
    description: 'When emergency occurs in pattern, Tower should provide immediate assistance',
    context: buildTestContext(
      'EMERGENCY',
      createSessionHistory([
        createTransmissionEvent('San Jose Tower, Cessna One Two Three Alpha Bravo, emergency, smoke in cockpit, need immediate landing.', 'PILOT', 'EMERGENCY'),
      ]),
      'Phase advanced from TRAFFIC_PATTERN to EMERGENCY',
      { userSelectedFrequencyType: 'TWR', triggerType: 'phase_entry' }
    ),
    expectations: {
      shouldRespond: true,
      messagePatterns: [
        /(cleared|emergency|souls|fuel|assistance|any runway)/i,
      ],
      forbiddenPatterns: [/\[.*\]/, /\{.*\}/],
      minLength: 10,
    },
  },
];

describe('AtcAgentService Regression Tests - Arrival', () => {
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
      console.log(`Arrival Tests: ${timings.length} tests, Average duration: ${average.toFixed(2)}ms`);
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

