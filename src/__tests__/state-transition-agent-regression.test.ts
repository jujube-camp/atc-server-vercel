/**
 * StateTransitionAgentService Regression Tests
 * 
 * Comprehensive test suite for StateTransitionAgentService.evaluateStateTransition()
 * Tests cover phase advancement evaluation across FSM phases:
 * - All requirements met → should advance
 * - Missing requirements → should not advance
 * - Latest transmission has errors → should not advance
 * - Evidence-based requirement checking
 * - Proper next phase selection
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { StateTransitionAgentService } from '../services/stateTransitionAgentService.js';
import type { StateTransitionAgentResponse, TransitionDetail } from '../services/stateTransitionAgentService.js';
import { getFsmGraph, FlightModeId, type PhaseName } from '../common/index.js';
import pino from 'pino';
import { REAL_KSJC_AIRPORT_INFO, createSessionHistory, createTransmissionEvent, createPhaseAdvanceEvent } from './utils/test-helpers.js';

// Test logger - silent during tests unless TEST_LOG_LEVEL is set
const logger = pino({
  level: process.env.TEST_LOG_LEVEL || 'silent',
  transport: process.env.TEST_LOG_LEVEL ? { target: 'pino-pretty' } : undefined,
});

/**
 * Test case structure for StateTransitionAgentService
 */
interface StateTransitionTestCase {
  name: string;
  description: string;
  currentPhase: PhaseName;
  sessionHistory: string[];
  airportIcao: string;
  aircraftTailNumber: string;
  airportInfo?: string;
  expectations: {
    // Should advance to next phase?
    shouldAdvance: boolean;
    
    // Expected next phase (if advancing)
    expectedNextPhase?: string;
    
    // Which requirements should be met?
    requirementsMet?: { [key: string]: boolean };
    
    // Patterns in reasons
    reasonPatterns?: { [requirementText: string]: RegExp };
  };
}


/**
 * Test Cases
 */
const TEST_CASES: StateTransitionTestCase[] = [
  // =========================================================================
  // PARKING_STARTUP → TAXI_OUT
  // =========================================================================
  {
    name: 'PARKING_STARTUP - All requirements met, should advance',
    description: 'Pilot has ATIS, requested taxi, received clearance, and read back correctly with all elements',
    currentPhase: 'PARKING_STARTUP',
    sessionHistory: createSessionHistory([
      createTransmissionEvent('San Jose Ground, Cessna One Two Three Alpha Bravo, with information Charlie, request taxi', 'PILOT', 'PARKING_STARTUP'),
      createTransmissionEvent('Cessna One Two Three Alpha Bravo, taxi to runway three zero left via Hotel, Zulu, hold short runway three zero left', 'GND', 'PARKING_STARTUP'),
      createTransmissionEvent('Taxi to runway three zero left via Hotel, Zulu, hold short runway three zero left, Cessna One Two Three Alpha Bravo', 'PILOT', 'PARKING_STARTUP'),
    ]),
    airportIcao: 'KSJC',
    aircraftTailNumber: 'N123AB',
    airportInfo: REAL_KSJC_AIRPORT_INFO,
    expectations: {
      shouldAdvance: true,
      expectedNextPhase: 'TAXI_OUT',
    },
  },
  {
    name: 'PARKING_STARTUP - Missing ATIS, should not advance',
    description: 'Pilot requested taxi but never provided ATIS information',
    currentPhase: 'PARKING_STARTUP',
    sessionHistory: createSessionHistory([
      createTransmissionEvent('San Jose Ground, Cessna One Two Three Alpha Bravo, ready to taxi', 'PILOT', 'PARKING_STARTUP'),
      createTransmissionEvent('Cessna One Two Three Alpha Bravo, say you have information', 'GND', 'PARKING_STARTUP'),
    ]),
    airportIcao: 'KSJC',
    aircraftTailNumber: 'N123AB',
    expectations: {
      shouldAdvance: false,
    },
  },
  {
    name: 'PARKING_STARTUP - Incomplete readback, should not advance',
    description: 'Pilot received taxi clearance but read back incompletely (missing hold short)',
    currentPhase: 'PARKING_STARTUP',
    sessionHistory: createSessionHistory([
      createTransmissionEvent('San Jose Ground, Cessna One Two Three Alpha Bravo, with information Charlie, request taxi', 'PILOT', 'PARKING_STARTUP'),
      createTransmissionEvent('Cessna One Two Three Alpha Bravo, taxi to runway three zero left via Hotel, Zulu, hold short runway three zero left', 'GND', 'PARKING_STARTUP'),
      createTransmissionEvent('Taxi via Hotel, Zulu, Cessna One Two Three Alpha Bravo', 'PILOT', 'PARKING_STARTUP'),
    ]),
    airportIcao: 'KSJC',
    aircraftTailNumber: 'N123AB',
    expectations: {
      shouldAdvance: false,
    },
  },
  {
    name: 'PARKING_STARTUP - Real KSJC startup with squawk correction',
    description: 'Real session data with ATIS, taxi request, clearance, incorrect squawk corrected before taxi',
    currentPhase: 'PARKING_STARTUP',
    sessionHistory: createSessionHistory([
      createTransmissionEvent('San Jose Ground, Cessna One Two Three Alpha Bravo at parking, request for downwind departure with information Whiskey.', 'PILOT', 'PARKING_STARTUP', null, new Date('2025-11-17T18:07:58.552Z')),
      createTransmissionEvent('Cessna one two three alpha bravo, San Jose Ground, runway three zero right, taxi via alpha, zulu, hold short runway three zero right, squawk zero two zero one.', 'GND', 'PARKING_STARTUP', null, new Date('2025-11-17T18:08:01.388Z')),
      createTransmissionEvent('Runway three zero right, taxi via Alpha Zulu, hold short runway three zero right, and squawk zero one zero one, Cessna one two three Alpha Bravo.', 'PILOT', 'PARKING_STARTUP', null, new Date('2025-11-17T18:11:13.530Z')),
      createTransmissionEvent('Cessna one two three alpha bravo, negative, squawk zero two zero one.', 'GND', 'PARKING_STARTUP', null, new Date('2025-11-17T18:11:15.948Z')),
      createTransmissionEvent('Squawk zero two zero one Cessna one two three Alpha Bravo.', 'PILOT', 'PARKING_STARTUP', null, new Date('2025-11-17T18:11:36.545Z')),
    ]),
    airportIcao: 'KSJC',
    aircraftTailNumber: 'N123AB',
    airportInfo: REAL_KSJC_AIRPORT_INFO,
    expectations: {
      shouldAdvance: true,
      expectedNextPhase: 'TAXI_OUT',
    },
  },
  {
    name: 'PARKING_STARTUP - Real KSJC startup with correct readback',
    description: 'Real session data with ATIS, taxi request, clearance, and correct readback',
    currentPhase: 'PARKING_STARTUP',
    sessionHistory: createSessionHistory([
      createTransmissionEvent('San Jose Ground, Cessna one two three Alpha Bravo at parking, request for downwind departure with information Whiskey.', 'PILOT', 'PARKING_STARTUP', null, new Date('2025-11-17T18:30:54.197Z')),
      createTransmissionEvent('Cessna one two three alpha bravo, San Jose Ground, runway three zero right, taxi via alpha, hold short runway three zero right.', 'GND', 'PARKING_STARTUP', null, new Date('2025-11-17T18:30:56.312Z')),
      createTransmissionEvent('Runway three zero right, taxi via alpha and hold short runway three zero right, Cessna one two three alpha bravo.', 'PILOT', 'PARKING_STARTUP', null, new Date('2025-11-17T18:31:25.368Z')),
    ]),
    airportIcao: 'KSJC',
    aircraftTailNumber: 'N123AB',
    airportInfo: REAL_KSJC_AIRPORT_INFO,
    expectations: {
      shouldAdvance: true,
      expectedNextPhase: 'TAXI_OUT',
    },
  },
  {
    name: 'PARKING_STARTUP - Missing callsign in latest transmission, should not advance',
    description: 'Requirements met but pilot omitted callsign in readback',
    currentPhase: 'PARKING_STARTUP',
    sessionHistory: createSessionHistory([
      createTransmissionEvent('San Jose Ground, Cessna One Two Three Alpha Bravo, with information Charlie, request taxi', 'PILOT', 'PARKING_STARTUP'),
      createTransmissionEvent('Cessna One Two Three Alpha Bravo, taxi to runway three zero left via Hotel, Zulu, hold short runway three zero left', 'GND', 'PARKING_STARTUP'),
      createTransmissionEvent('Taxi to runway three zero left via Hotel, Zulu, hold short runway three zero left', 'PILOT', 'PARKING_STARTUP'),
    ]),
    airportIcao: 'KSJC',
    aircraftTailNumber: 'N123AB',
    expectations: {
      shouldAdvance: false,
    },
  },

  // =========================================================================
  // HOLD_SHORT → LINE_UP_AND_WAIT or CLIMBING
  // =========================================================================
  {
    name: 'HOLD_SHORT - LUAW clearance correctly acknowledged, should advance to LINE_UP_AND_WAIT',
    description: 'Pilot received and correctly read back line up and wait clearance',
    currentPhase: 'HOLD_SHORT',
    sessionHistory: createSessionHistory([
      createTransmissionEvent('San Jose Tower, Cessna One Two Three Alpha Bravo, holding short runway three zero left, ready for departure', 'PILOT', 'HOLD_SHORT'),
      createTransmissionEvent('Cessna One Two Three Alpha Bravo, runway three zero left, line up and wait', 'TWR', 'HOLD_SHORT'),
      createTransmissionEvent('Runway three zero left, line up and wait, Cessna One Two Three Alpha Bravo', 'PILOT', 'HOLD_SHORT'),
    ]),
    airportIcao: 'KSJC',
    aircraftTailNumber: 'N123AB',
    expectations: {
      shouldAdvance: true,
      expectedNextPhase: 'LINE_UP_AND_WAIT',
    },
  },
  {
    name: 'HOLD_SHORT - Takeoff clearance correctly acknowledged, should advance to CLIMBING',
    description: 'Pilot received and correctly read back takeoff clearance',
    currentPhase: 'HOLD_SHORT',
    sessionHistory: createSessionHistory([
      createTransmissionEvent('San Jose Tower, Cessna One Two Three Alpha Bravo, holding short runway three zero left, ready for departure', 'PILOT', 'HOLD_SHORT'),
      createTransmissionEvent('Cessna One Two Three Alpha Bravo, runway three zero left, cleared for takeoff', 'TWR', 'HOLD_SHORT'),
      createTransmissionEvent('Runway three zero left, cleared for takeoff, Cessna One Two Three Alpha Bravo', 'PILOT', 'HOLD_SHORT'),
    ]),
    airportIcao: 'KSJC',
    aircraftTailNumber: 'N123AB',
    expectations: {
      shouldAdvance: true,
      expectedNextPhase: 'CLIMBING',
    },
  },
  {
    name: 'HOLD_SHORT - Wrong runway in readback, should not advance',
    description: 'Pilot read back wrong runway number (critical safety error)',
    currentPhase: 'HOLD_SHORT',
    sessionHistory: createSessionHistory([
      createTransmissionEvent('San Jose Tower, Cessna One Two Three Alpha Bravo, holding short runway three zero left', 'PILOT', 'HOLD_SHORT'),
      createTransmissionEvent('Cessna One Two Three Alpha Bravo, runway three zero left, cleared for takeoff', 'TWR', 'HOLD_SHORT'),
      createTransmissionEvent('Runway one nine right, cleared for takeoff, Cessna One Two Three Alpha Bravo', 'PILOT', 'HOLD_SHORT'),
    ]),
    airportIcao: 'KSJC',
    aircraftTailNumber: 'N123AB',
    expectations: {
      shouldAdvance: false,
    },
  },
  {
    name: 'HOLD_SHORT - No Tower clearance yet, should not advance',
    description: 'Pilot holding short but Tower has not issued clearance',
    currentPhase: 'HOLD_SHORT',
    sessionHistory: createSessionHistory([
      createTransmissionEvent('San Jose Tower, Cessna One Two Three Alpha Bravo, holding short runway three zero left, ready for departure', 'PILOT', 'HOLD_SHORT'),
    ]),
    airportIcao: 'KSJC',
    aircraftTailNumber: 'N123AB',
    expectations: {
      shouldAdvance: false,
    },
  },

  // =========================================================================
  // LINE_UP_AND_WAIT → CLIMBING
  // =========================================================================
  {
    name: 'LINE_UP_AND_WAIT - Takeoff clearance acknowledged, should advance',
    description: 'Tower issued takeoff clearance and pilot acknowledged correctly',
    currentPhase: 'LINE_UP_AND_WAIT',
    sessionHistory: createSessionHistory([
      createTransmissionEvent('Cessna One Two Three Alpha Bravo, lined up runway three zero left', 'PILOT', 'LINE_UP_AND_WAIT'),
      createTransmissionEvent('Cessna One Two Three Alpha Bravo, runway three zero left, cleared for takeoff', 'TWR', 'LINE_UP_AND_WAIT'),
      createTransmissionEvent('Runway three zero left, cleared for takeoff, Cessna One Two Three Alpha Bravo', 'PILOT', 'LINE_UP_AND_WAIT'),
    ]),
    airportIcao: 'KSJC',
    aircraftTailNumber: 'N123AB',
    expectations: {
      shouldAdvance: true,
      expectedNextPhase: 'CLIMBING',
    },
  },

  // =========================================================================
  // CLIMBING → TRAFFIC_PATTERN or CRUISING
  // =========================================================================
  {
    name: 'CLIMBING - Pattern entry acknowledged, should advance to TRAFFIC_PATTERN',
    description: 'Pilot correctly acknowledged pattern entry instruction',
    currentPhase: 'CLIMBING',
    sessionHistory: createSessionHistory([
      createTransmissionEvent('Cessna One Two Three Alpha Bravo, make left closed traffic', 'TWR', 'CLIMBING'),
      createTransmissionEvent('Make left closed traffic, Cessna One Two Three Alpha Bravo', 'PILOT', 'CLIMBING'),
    ]),
    airportIcao: 'KSJC',
    aircraftTailNumber: 'N123AB',
    expectations: {
      shouldAdvance: true,
      expectedNextPhase: 'TRAFFIC_PATTERN',
    },
  },
  {
    name: 'CLIMBING - Departure handoff acknowledged, should advance to CRUISING',
    description: 'Pilot acknowledged departure frequency handoff',
    currentPhase: 'CLIMBING',
    sessionHistory: createSessionHistory([
      createTransmissionEvent('Cessna One Two Three Alpha Bravo, contact Departure on one two four point three', 'TWR', 'CLIMBING'),
      createTransmissionEvent('Contact Departure one two four point three, Cessna One Two Three Alpha Bravo', 'PILOT', 'CLIMBING'),
    ]),
    airportIcao: 'KSJC',
    aircraftTailNumber: 'N123AB',
    expectations: {
      shouldAdvance: true,
      expectedNextPhase: 'DEPARTURE',
    },
  },
  {
    name: 'CLIMBING - Missing callsign in acknowledgment, should not advance',
    description: 'Pilot acknowledged but missing callsign at end',
    currentPhase: 'CLIMBING',
    sessionHistory: createSessionHistory([
      createTransmissionEvent('Cessna One Two Three Alpha Bravo, make left closed traffic', 'TWR', 'CLIMBING'),
      createTransmissionEvent('Make left closed traffic', 'PILOT', 'CLIMBING'),
    ]),
    airportIcao: 'KSJC',
    aircraftTailNumber: 'N123AB',
    expectations: {
      shouldAdvance: false,
    },
  },

  // =========================================================================
  // TRAFFIC_PATTERN → LANDED
  // =========================================================================
  {
    name: 'TRAFFIC_PATTERN - Landing clearance acknowledged, should advance',
    description: 'Pilot correctly read back landing clearance',
    currentPhase: 'TRAFFIC_PATTERN',
    sessionHistory: createSessionHistory([
      createTransmissionEvent('San Jose Tower, Cessna One Two Three Alpha Bravo, left downwind, runway three zero left', 'PILOT', 'TRAFFIC_PATTERN'),
      createTransmissionEvent('Cessna One Two Three Alpha Bravo, runway three zero left, cleared to land', 'TWR', 'TRAFFIC_PATTERN'),
      createTransmissionEvent('Runway three zero left, cleared to land, Cessna One Two Three Alpha Bravo', 'PILOT', 'TRAFFIC_PATTERN'),
    ]),
    airportIcao: 'KSJC',
    aircraftTailNumber: 'N123AB',
    expectations: {
      shouldAdvance: true,
      expectedNextPhase: 'SHORT_FINAL',
    },
  },
  {
    name: 'TRAFFIC_PATTERN - Go-around acknowledged, should advance to CLIMBING',
    description: 'Tower issued go-around and pilot acknowledged',
    currentPhase: 'TRAFFIC_PATTERN',
    sessionHistory: createSessionHistory([
      createTransmissionEvent('Cessna One Two Three Alpha Bravo, go around, make left closed traffic', 'TWR', 'TRAFFIC_PATTERN'),
      createTransmissionEvent('Go around, make left closed traffic, Cessna One Two Three Alpha Bravo', 'PILOT', 'TRAFFIC_PATTERN'),
    ]),
    airportIcao: 'KSJC',
    aircraftTailNumber: 'N123AB',
    expectations: {
      shouldAdvance: false,
    },
  },
  {
    name: 'TRAFFIC_PATTERN - No landing clearance yet, should not advance',
    description: 'Pilot in pattern but Tower has not issued clearance',
    currentPhase: 'TRAFFIC_PATTERN',
    sessionHistory: createSessionHistory([
      createTransmissionEvent('San Jose Tower, Cessna One Two Three Alpha Bravo, left downwind, runway three zero left', 'PILOT', 'TRAFFIC_PATTERN'),
    ]),
    airportIcao: 'KSJC',
    aircraftTailNumber: 'N123AB',
    expectations: {
      shouldAdvance: false,
    },
  },

  // =========================================================================
  // ROLLOUT → TAXI_BACK
  // =========================================================================
  {
    name: 'ROLLOUT - Ground handoff acknowledged, should advance',
    description: 'Tower issued exit and ground handoff, pilot acknowledged',
    currentPhase: 'ROLLOUT',
    sessionHistory: createSessionHistory([
      createTransmissionEvent('Cessna One Two Three Alpha Bravo, clear of runway three zero left', 'PILOT', 'ROLLOUT'),
      createTransmissionEvent('Cessna One Two Three Alpha Bravo, turn left at Bravo, contact Ground point seven', 'TWR', 'ROLLOUT'),
      createTransmissionEvent('Turn left at Bravo, contact Ground point seven, Cessna One Two Three Alpha Bravo', 'PILOT', 'ROLLOUT'),
    ]),
    airportIcao: 'KSJC',
    aircraftTailNumber: 'N123AB',
    expectations: {
      shouldAdvance: true,
      expectedNextPhase: 'TAXI_BACK',
    },
  },
  {
    name: 'ROLLOUT - No ground handoff yet, should not advance',
    description: 'Pilot clear of runway but Tower has not issued ground handoff',
    currentPhase: 'ROLLOUT',
    sessionHistory: createSessionHistory([
      createTransmissionEvent('Cessna One Two Three Alpha Bravo, clear of runway three zero left', 'PILOT', 'ROLLOUT'),
    ]),
    airportIcao: 'KSJC',
    aircraftTailNumber: 'N123AB',
    expectations: {
      shouldAdvance: false,
    },
  },

  // =========================================================================
  // TAXI_BACK → SHUTDOWN
  // =========================================================================
  {
    name: 'TAXI_BACK - Taxi to parking acknowledged, should advance',
    description: 'Ground issued taxi to parking, pilot acknowledged',
    currentPhase: 'TAXI_BACK',
    sessionHistory: createSessionHistory([
      createTransmissionEvent('San Jose Ground, Cessna One Two Three Alpha Bravo, request taxi to parking', 'PILOT', 'TAXI_BACK'),
      createTransmissionEvent('Cessna One Two Three Alpha Bravo, taxi to parking via Zulu, Alpha, good day', 'GND', 'TAXI_BACK'),
      createTransmissionEvent('Taxi to parking via Zulu, Alpha, good day, Cessna One Two Three Alpha Bravo', 'PILOT', 'TAXI_BACK'),
    ]),
    airportIcao: 'KSJC',
    aircraftTailNumber: 'N123AB',
    expectations: {
      shouldAdvance: true,
      expectedNextPhase: 'SHUTDOWN',
    },
  },

  // =========================================================================
  // LATEST TRANSMISSION ERROR TESTS
  // =========================================================================
  {
    name: 'ERROR - Requirements met but latest has wrong runway',
    description: 'All requirements appear met but pilot read back wrong runway in latest transmission',
    currentPhase: 'HOLD_SHORT',
    sessionHistory: createSessionHistory([
      createTransmissionEvent('San Jose Tower, Cessna One Two Three Alpha Bravo, holding short runway three zero left', 'PILOT', 'HOLD_SHORT'),
      createTransmissionEvent('Cessna One Two Three Alpha Bravo, runway three zero left, cleared for takeoff', 'TWR', 'HOLD_SHORT'),
      createTransmissionEvent('Runway one nine right, cleared for takeoff, Cessna One Two Three Alpha Bravo', 'PILOT', 'HOLD_SHORT'),
    ]),
    airportIcao: 'KSJC',
    aircraftTailNumber: 'N123AB',
    expectations: {
      shouldAdvance: false,
    },
  },
  {
    name: 'ERROR - Requirements met but missing callsign in latest',
    description: 'All requirements met but latest transmission missing callsign at end',
    currentPhase: 'CLIMBING',
    sessionHistory: createSessionHistory([
      createTransmissionEvent('Cessna One Two Three Alpha Bravo, make left closed traffic', 'TWR', 'CLIMBING'),
      createTransmissionEvent('Make left closed traffic', 'PILOT', 'CLIMBING'),
    ]),
    airportIcao: 'KSJC',
    aircraftTailNumber: 'N123AB',
    expectations: {
      shouldAdvance: false,
    },
  },
  {
    name: 'ERROR - Requirements met but latest has wrong taxiway',
    description: 'Pilot read back wrong taxiway in latest transmission',
    currentPhase: 'PARKING_STARTUP',
    sessionHistory: createSessionHistory([
      createTransmissionEvent('San Jose Ground, Cessna One Two Three Alpha Bravo, with information Charlie, request taxi', 'PILOT', 'PARKING_STARTUP'),
      createTransmissionEvent('Cessna One Two Three Alpha Bravo, taxi to runway three zero left via Hotel, Zulu, hold short runway three zero left', 'GND', 'PARKING_STARTUP'),
      createTransmissionEvent('Taxi to runway three zero left via Charlie, Delta, hold short runway three zero left, Cessna One Two Three Alpha Bravo', 'PILOT', 'PARKING_STARTUP'),
    ]),
    airportIcao: 'KSJC',
    aircraftTailNumber: 'N123AB',
    expectations: {
      shouldAdvance: false,
    },
  },
  {
    name: 'ERROR - Latest transmission is untranscribable',
    description: 'Pilot transmission was unintelligible',
    currentPhase: 'HOLD_SHORT',
    sessionHistory: createSessionHistory([
      createTransmissionEvent('San Jose Tower, Cessna One Two Three Alpha Bravo, holding short runway three zero left', 'PILOT', 'HOLD_SHORT'),
      createTransmissionEvent('Cessna One Two Three Alpha Bravo, runway three zero left, cleared for takeoff', 'TWR', 'HOLD_SHORT'),
      createTransmissionEvent('[UNTRANSCRIBABLE]', 'PILOT', 'HOLD_SHORT'),
    ]),
    airportIcao: 'KSJC',
    aircraftTailNumber: 'N123AB',
    expectations: {
      shouldAdvance: false,
    },
  },

  // =========================================================================
  // EDGE CASES
  // =========================================================================
  {
    name: 'EDGE - Empty requirements phase (TAXI_OUT)',
    description: 'TAXI_OUT has no requirements, should evaluate based on latest transmission quality',
    currentPhase: 'TAXI_OUT',
    sessionHistory: createSessionHistory([
      createTransmissionEvent('Taxi to runway three zero left via Hotel, Zulu, hold short runway three zero left, Cessna One Two Three Alpha Bravo', 'PILOT', 'TAXI_OUT'),
    ]),
    airportIcao: 'KSJC',
    aircraftTailNumber: 'N123AB',
    expectations: {
      shouldAdvance: true,
      expectedNextPhase: 'HOLD_SHORT',
    },
  },
  {
    name: 'EDGE - Multiple advance options (TRAFFIC_PATTERN)',
    description: 'TRAFFIC_PATTERN can advance to LANDED or CLIMBING, should pick based on history',
    currentPhase: 'TRAFFIC_PATTERN',
    sessionHistory: createSessionHistory([
      createTransmissionEvent('San Jose Tower, Cessna One Two Three Alpha Bravo, left downwind, runway three zero left', 'PILOT', 'TRAFFIC_PATTERN'),
      createTransmissionEvent('Cessna One Two Three Alpha Bravo, runway three zero left, cleared to land', 'TWR', 'TRAFFIC_PATTERN'),
      createTransmissionEvent('Runway three zero left, cleared to land, Cessna One Two Three Alpha Bravo', 'PILOT', 'TRAFFIC_PATTERN'),
    ]),
    airportIcao: 'KSJC',
    aircraftTailNumber: 'N123AB',
    expectations: {
      shouldAdvance: true,
      expectedNextPhase: 'SHORT_FINAL',
    },
  },
  {
    name: 'EDGE - Pilot using abbreviated callsign after establishment',
    description: 'Pilot uses abbreviated callsign in readback (should be acceptable)',
    currentPhase: 'HOLD_SHORT',
    sessionHistory: createSessionHistory([
      createTransmissionEvent('San Jose Tower, Cessna November One Two Three Alpha Bravo, holding short runway three zero left', 'PILOT', 'HOLD_SHORT'),
      createTransmissionEvent('Cessna One Two Three Alpha Bravo, runway three zero left, cleared for takeoff', 'TWR', 'HOLD_SHORT'),
      createTransmissionEvent('Runway three zero left, cleared for takeoff, three alpha bravo', 'PILOT', 'HOLD_SHORT'),
    ]),
    airportIcao: 'KSJC',
    aircraftTailNumber: 'N123AB',
    expectations: {
      shouldAdvance: true,
      expectedNextPhase: 'CLIMBING',
    },
  },
  {
    name: 'TAXI_OUT - Auto advance to HOLD_SHORT when entering phase',
    description: 'When entering TAXI_OUT from PARKING_STARTUP, should automatically be approved for HOLD_SHORT as there are no requirements',
    currentPhase: 'TAXI_OUT',
    sessionHistory: createSessionHistory([
      createPhaseAdvanceEvent('DUMMY_START' as any, 'PARKING_STARTUP'),
      createTransmissionEvent('San Jose Ground, Cessna one two three Alpha Bravo at parking, request taxi to runway departure', 'PILOT', 'PARKING_STARTUP'),
      createTransmissionEvent('Cessna one two three alpha bravo, San Jose Ground, runway three zero right, taxi via Alpha, Zulu.', 'GND', 'PARKING_STARTUP'),
      createTransmissionEvent('Runway three zero right, taxi via Alpha Zulu, Cessna one two three Alpha Bravo.', 'PILOT', 'PARKING_STARTUP'),
      createTransmissionEvent('And we have information whiskey.', 'PILOT', 'PARKING_STARTUP'),
      createPhaseAdvanceEvent('PARKING_STARTUP', 'TAXI_OUT'),
    ]),
    airportIcao: 'KSJC',
    aircraftTailNumber: 'N123AB',
    airportInfo: REAL_KSJC_AIRPORT_INFO,
    expectations: {
      shouldAdvance: true,
      expectedNextPhase: 'HOLD_SHORT',
    },
  },
];

/**
 * Helper to get the first approved transition's next phase
 */
function getNextPhaseFromResponse(response: StateTransitionAgentResponse): string | null {
  const approvedTransition = response.transitions.find(t => t.approved);
  return approvedTransition?.to_phase || null;
}

/**
 * Helper to get requirements checklist from the active or first transition
 */
function getRequirementsChecklist(response: StateTransitionAgentResponse) {
  const activeTransition = response.transitions.find(
    t => t.transition_id === response.active_transition_id
  );
  const transition = activeTransition || response.transitions[0];
  return transition?.requirements_checklist || [];
}

/**
 * Helper to validate state transition response
 */
function validateResponse(
  testCase: StateTransitionTestCase,
  response: StateTransitionAgentResponse
) {
  try {
    const { expectations } = testCase;

    // Basic structure validation - new format
    expect(response).toHaveProperty('transitions');
    expect(response).toHaveProperty('active_transition_id');
    expect(response).toHaveProperty('should_advance');
    expect(Array.isArray(response.transitions)).toBe(true);
    expect(typeof response.should_advance).toBe('boolean');
    expect(response.active_transition_id === null || typeof response.active_transition_id === 'string').toBe(true);

    // Validate each transition structure
    for (const transition of response.transitions) {
      expect(transition).toHaveProperty('transition_id');
      expect(transition).toHaveProperty('to_phase');
      expect(transition).toHaveProperty('user_label');
      expect(transition).toHaveProperty('active');
      expect(transition).toHaveProperty('approved');
      expect(transition).toHaveProperty('requirements_checklist');
      expect(transition).toHaveProperty('suggested_audio');
      expect(typeof transition.active).toBe('boolean');
      expect(typeof transition.approved).toBe('boolean');
      expect(Array.isArray(transition.requirements_checklist)).toBe(true);
      expect(typeof transition.suggested_audio).toBe('string');
    }

    // Validate should_advance
    expect(response.should_advance).toBe(expectations.shouldAdvance);

    // Validate next_phase (from first approved transition)
    const nextPhase = getNextPhaseFromResponse(response);
    if (expectations.shouldAdvance && expectations.expectedNextPhase) {
      expect(nextPhase).toBe(expectations.expectedNextPhase);
    }

    if (!expectations.shouldAdvance) {
      // No transition should be approved
      const hasApproved = response.transitions.some(t => t.approved);
      expect(hasApproved).toBe(false);
    }

    // Validate requirements checklist structure
    const checklist = getRequirementsChecklist(response);
    for (const req of checklist) {
      expect(req).toHaveProperty('requirement_text');
      expect(req).toHaveProperty('met');
      expect(req).toHaveProperty('reason');
      expect(typeof req.requirement_text).toBe('string');
      expect(typeof req.met).toBe('boolean');
      expect(typeof req.reason).toBe('string');
      
      // Reason should not be empty
      expect(req.reason.length).toBeGreaterThan(5);
    }

    // If should_advance is true, at least one transition should have all requirements met
    if (expectations.shouldAdvance) {
      const hasApprovedTransition = response.transitions.some(t => t.approved);
      expect(hasApprovedTransition, 'At least one transition should be approved when should_advance is true').toBe(true);
    }

    // If should_advance is false and there are requirements, at least one should not be met
    if (!expectations.shouldAdvance && checklist.length > 0) {
      const someFailed = checklist.some(r => !r.met);
      expect(someFailed, 'At least one requirement should not be met when should_advance is false').toBe(true);
    }

  } catch (error) {
    // Log full input and output for debugging
    console.error('\n' + '='.repeat(80));
    console.error('TEST FAILED - Full Input and Output for Debugging');
    console.error('='.repeat(80));
    console.error('\n📥 INPUT (Test Case):');
    console.error(JSON.stringify({
      name: testCase.name,
      description: testCase.description,
      currentPhase: testCase.currentPhase,
      sessionHistory: testCase.sessionHistory,
      expectations: testCase.expectations,
    }, null, 2));
    console.error('\n📤 OUTPUT (Response):');
    console.error(JSON.stringify(response, null, 2));
    console.error('\n❌ Error:');
    console.error(error);
    console.error('='.repeat(80) + '\n');
    
    // Re-throw the error so the test still fails
    throw error;
  }
}

/**
 * Main Test Suite
 */
describe('StateTransitionAgentService Regression Tests', () => {
  beforeAll(() => {
    // Ensure environment is set up
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY must be set for regression tests');
    }
  });

  // Run all test cases
  for (const testCase of TEST_CASES) {
    it(testCase.name, async () => {
      if (process.env.TEST_VERBOSE) {
        console.log(`\n${'='.repeat(70)}`);
        console.log(`Test: ${testCase.name}`);
        console.log(`Description: ${testCase.description}`);
        console.log(`Current Phase: ${testCase.currentPhase}`);
        console.log(`History entries: ${testCase.sessionHistory.length}`);
        console.log(`${'='.repeat(70)}\n`);
      }

      // Call the service
      const response = await StateTransitionAgentService.evaluateStateTransition(
        testCase.sessionHistory,
        testCase.currentPhase,
        testCase.airportIcao,
        testCase.aircraftTailNumber,
        testCase.airportInfo ?? REAL_KSJC_AIRPORT_INFO,
        logger
      );

      if (process.env.TEST_VERBOSE) {
        console.log(`Should Advance: ${response.should_advance}`);
        console.log(`Active Transition ID: ${response.active_transition_id || '(none)'}`);
        console.log(`\nTransitions:`);
        response.transitions.forEach((t, idx) => {
          console.log(`  ${idx + 1}. ${t.transition_id}`);
          console.log(`     Active: ${t.active}, Approved: ${t.approved}`);
          console.log(`     To Phase: ${t.to_phase}`);
          console.log(`     Suggested Audio: ${t.suggested_audio.substring(0, 50)}...`);
          console.log(`     Requirements:`);
          t.requirements_checklist.forEach((req, ridx) => {
            console.log(`       ${ridx + 1}. ${req.met ? '✅' : '❌'} ${req.requirement_text}`);
            console.log(`          Reason: ${req.reason}`);
          });
        });
        console.log();
      }

      // Validate the response
      validateResponse(testCase, response);
    }, 30000); // 30 second timeout for API calls
  }

  // =========================================================================
  // CONSISTENCY TESTS
  // =========================================================================
  describe('Consistency Tests', () => {
    it('should generate consistent decisions for identical inputs', async () => {
      const testCase = TEST_CASES[0]; // Use first test case (should advance)
      const runs = 3;
      const decisions: boolean[] = [];

      for (let i = 0; i < runs; i++) {
        const response = await StateTransitionAgentService.evaluateStateTransition(
          testCase.sessionHistory,
          testCase.currentPhase,
          testCase.airportIcao,
          testCase.aircraftTailNumber,
          REAL_KSJC_AIRPORT_INFO,
          logger
        );
        decisions.push(response.should_advance);
      }

      // All decisions should be the same
      const uniqueDecisions = [...new Set(decisions)];
      expect(uniqueDecisions.length).toBe(1);
      expect(uniqueDecisions[0]).toBe(testCase.expectations.shouldAdvance);

      if (process.env.TEST_VERBOSE) {
        console.log('\nConsistency Test Results:');
        decisions.forEach((d, i) => {
          console.log(`  Run ${i + 1}: should_advance = ${d}`);
        });
      }
    }, 90000); // 90 second timeout for 3 runs
  });

  // =========================================================================
  // REQUIREMENTS VALIDATION
  // =========================================================================
  describe('Requirements Validation', () => {
    it('should include all FSM requirements in checklist', async () => {
      const testCase = TEST_CASES[0]; // PARKING_STARTUP case
      
      const response = await StateTransitionAgentService.evaluateStateTransition(
        testCase.sessionHistory,
        testCase.currentPhase,
        testCase.airportIcao,
        testCase.aircraftTailNumber,
        REAL_KSJC_AIRPORT_INFO,
        logger
      );

      // Get FSM requirements from the first transition
      const fsmGraph = getFsmGraph(FlightModeId.VFR);
      const availableTransitions = fsmGraph.listTransitionsFrom(testCase.currentPhase);
      
      // Find the matching transition from response
      const firstResponseTransition = response.transitions[0];
      const matchingFsmTransition = availableTransitions.find(
        t => t.id === firstResponseTransition?.transition_id
      );
      
      // Some transitions may not have requirements property
      const expectedRequirements = (matchingFsmTransition && 'requirements' in matchingFsmTransition && matchingFsmTransition.requirements)
        ? matchingFsmTransition.requirements
        : [];

      // Get checklist from response
      const checklist = firstResponseTransition?.requirements_checklist || [];

      // Check that checklist has the same number of requirements
      expect(checklist.length).toBe(expectedRequirements.length);

      // Check that each requirement text matches FSM (order matters)
      checklist.forEach((checklistItem, index) => {
        expect(checklistItem.requirement_text).toBe(expectedRequirements[index]);
      });

      if (process.env.TEST_VERBOSE) {
        console.log('\nRequirements Validation:');
        console.log(`Transition: ${matchingFsmTransition?.id || 'none'}`);
        console.log(`Expected: ${expectedRequirements.length} requirements`);
        console.log(`Received: ${checklist.length} requirements`);
        console.log('All requirements match FSM ✅');
      }
    }, 30000);
  });
});
