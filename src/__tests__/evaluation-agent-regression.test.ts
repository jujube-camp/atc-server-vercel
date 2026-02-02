/**
 * PilotCommunicationEvaluationService Regression Tests
 * 
 * Comprehensive test suite for PilotCommunicationEvaluationService.evaluatePilotCommunication()
 * Tests cover all major scenarios across FSM phases:
 * - Excellent communication (score 5)
 * - Good communication with minor issues (score 4)
 * - Adequate communication with errors (score 3)
 * - Poor communication (score 2)
 * - Unacceptable communication (score 1)
 * - Readback verification
 * - Missing elements
 * - Safety-critical errors
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { PilotCommunicationEvaluationService } from '../services/pilotCommunicationEvaluationService.js';
import type { PilotCommunicationEvaluationContext } from '../services/pilotCommunicationEvaluationService.js';
import type { PhaseName } from '../common/index.js';
import pino from 'pino';
import { createSessionHistory, createTransmissionEvent, createPhaseInfo } from './utils/test-helpers.js';

// Test logger - silent during tests unless TEST_LOG_LEVEL is set
const logger = pino({
  level: process.env.TEST_LOG_LEVEL || 'silent',
  transport: process.env.TEST_LOG_LEVEL ? { target: 'pino-pretty' } : undefined,
});

/**
 * Test case structure for PilotCommunicationEvaluationService
 */
interface EvaluationTestCase {
  name: string;
  description: string;
  context: PilotCommunicationEvaluationContext;
  expectations: {
    // Expected score
    expectedScore: number;
    
    // Score range (if exact match not required)
    scoreRange?: { min: number; max: number };
    
    // What patterns should be in the feedback?
    feedbackPatterns?: RegExp[];
    
    // What patterns should NOT be in the feedback?
    forbiddenFeedbackPatterns?: RegExp[];
    
    // What should perfect example include?
    perfectExamplePatterns?: RegExp[];
  };
}

/**
 * Helper to create standard context
 */
const createContext = (airportIcao: string = 'KSJC') => ({
  airport_icao: airportIcao,
});

/**
 * Test Cases
 */
const TEST_CASES: EvaluationTestCase[] = [
  // =========================================================================
  // EXCELLENT COMMUNICATION (Score 5)
  // =========================================================================
  {
    name: 'EXCELLENT - Perfect initial contact with ATIS',
    description: 'Pilot provides complete initial contact: callsign, ATIS, and request',
    context: {
      pilot_transcript: 'San Jose Ground, Cessna November One Two Three Alpha Bravo with information Charlie, request taxi',
      session_history: [],
      current_phase_info: createPhaseInfo('PARKING_STARTUP'),
      context: createContext(),
    },
    expectations: {
      expectedScore: 5,
      feedbackPatterns: [/perfect|excellent/i, /callsign|ATIS/i],
      perfectExamplePatterns: [/information|Charlie|Bravo|Delta/i, /request taxi/i],
    },
  },
  {
    name: 'EXCELLENT - Perfect takeoff clearance readback',
    description: 'Pilot correctly reads back takeoff clearance with runway and callsign',
    context: {
      pilot_transcript: 'Runway three zero left, cleared for takeoff, Cessna One Two Three Alpha Bravo',
      session_history: createSessionHistory([
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, runway three zero left, cleared for takeoff', 'TWR', 'HOLD_SHORT'),
      ]),
      current_phase_info: createPhaseInfo('HOLD_SHORT'),
      context: createContext(),
    },
    expectations: {
      expectedScore: 5,
      feedbackPatterns: [/perfect|excellent|correct/i, /readback/i],
      perfectExamplePatterns: [/runway.*two.*eight/i, /cleared.*takeoff/i],
    },
  },
  {
    name: 'EXCELLENT - Perfect pattern entry acknowledgment',
    description: 'Pilot correctly acknowledges pattern entry instruction',
    context: {
      pilot_transcript: 'Make left closed traffic, Cessna One Two Three Alpha Bravo',
      session_history: createSessionHistory([
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, make left closed traffic', 'TWR', 'CLIMBING'),
      ]),
      current_phase_info: createPhaseInfo('CLIMBING'),
      context: createContext(),
    },
    expectations: {
      expectedScore: 5,
      feedbackPatterns: [/perfect|excellent|correct/i],
      perfectExamplePatterns: [/traffic/i, /cessna/i],
    },
  },

  // =========================================================================
  // GOOD COMMUNICATION (Score 4)
  // =========================================================================
  {
    name: 'GOOD - Minor phraseology issue',
    description: 'Pilot communication is good but uses non-standard phraseology',
    context: {
      pilot_transcript: 'Ground, Cessna One Two Three Alpha Bravo, we have information Alpha and we are ready to taxi',
      session_history: [],
      current_phase_info: createPhaseInfo('PARKING_STARTUP'),
      context: createContext(),
    },
    expectations: {
      scoreRange: { min: 3, max: 5 },
      feedbackPatterns: [/(with information|say.*with|phraseology|ATIS)/i],
    },
  },

  // =========================================================================
  // ADEQUATE COMMUNICATION (Score 3)
  // =========================================================================
  {
    name: 'ADEQUATE - Missing ATIS',
    description: 'Pilot provides callsign and request but missing ATIS information',
    context: {
      pilot_transcript: 'San Jose Ground, Cessna November One Two Three Alpha Bravo, ready to taxi',
      session_history: [],
      current_phase_info: createPhaseInfo('PARKING_STARTUP'),
      context: createContext(),
    },
    expectations: {
      expectedScore: 3,
      feedbackPatterns: [/ATIS|information/i, /missing/i],
      perfectExamplePatterns: [/information.*charlie|bravo|alpha/i],
    },
  },
  {
    name: 'ADEQUATE - Incomplete readback',
    description: 'Pilot reads back partially but missing critical elements',
    context: {
      pilot_transcript: 'Taxi to runway three zero left, Cessna One Two Three Alpha Bravo',
      session_history: createSessionHistory([
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, taxi to runway three zero left via Hotel, Zulu, hold short runway three zero left', 'GND', 'PARKING_STARTUP'),
      ]),
      current_phase_info: createPhaseInfo('PARKING_STARTUP'),
      context: createContext(),
    },
    expectations: {
      scoreRange: { min: 2, max: 4 },
      feedbackPatterns: [/(hold short|incomplete|missing)/i],
      perfectExamplePatterns: [/hold short/i, /Hotel|Zulu/i],
    },
  },

  // =========================================================================
  // POOR COMMUNICATION (Score 2)
  // =========================================================================
  {
    name: 'POOR - Missing callsign',
    description: 'Pilot transmits without callsign (critical safety issue)',
    context: {
      pilot_transcript: 'Ready to taxi',
      session_history: [],
      current_phase_info: createPhaseInfo('PARKING_STARTUP'),
      context: createContext(),
    },
    expectations: {
      scoreRange: { min: 1, max: 2 },
      feedbackPatterns: [/missing\s+callsign/i, /must|always/i],
      perfectExamplePatterns: [/cessna.*november|alpha.*bravo/i],
    },
  },
  {
    name: 'POOR - Multiple missing elements',
    description: 'Pilot transmission missing multiple required elements',
    context: {
      pilot_transcript: 'San Jose Ground, Cessna One Two Three Alpha Bravo',
      session_history: [],
      current_phase_info: createPhaseInfo('PARKING_STARTUP'),
      context: createContext(),
    },
    expectations: {
      scoreRange: { min: 1, max: 3 },
      feedbackPatterns: [/(request|intent|ATIS|information)/i],
    },
  },

  // =========================================================================
  // UNACCEPTABLE COMMUNICATION (Score 1)
  // =========================================================================
  {
    name: 'UNACCEPTABLE - Wrong runway in readback',
    description: 'Pilot reads back wrong runway (critical safety error)',
    context: {
      pilot_transcript: 'Runway one nine right, cleared for takeoff, Cessna One Two Three Alpha Bravo',
      session_history: createSessionHistory([
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, runway three zero left, cleared for takeoff', 'TWR', 'HOLD_SHORT'),
      ]),
      current_phase_info: createPhaseInfo('HOLD_SHORT'),
      context: createContext(),
    },
    expectations: {
      expectedScore: 1,
      feedbackPatterns: [/critical|wrong.*runway|safety/i, /two.*eight/i],
      perfectExamplePatterns: [/two.*eight.*left/i],
    },
  },
  {
    name: 'UNACCEPTABLE - Untranscribable',
    description: 'Transmission was unclear or unintelligible',
    context: {
      pilot_transcript: '[UNTRANSCRIBABLE]',
      session_history: [],
      current_phase_info: createPhaseInfo('PARKING_STARTUP'),
      context: createContext(),
    },
    expectations: {
      expectedScore: 1,
      feedbackPatterns: [/unclear|unintelligible|microphone/i],
      perfectExamplePatterns: [/ground/i, /cessna|november/i],
    },
  },
  {
    name: 'UNACCEPTABLE - No callsign in readback',
    description: 'Pilot reads back clearance but omits callsign at end',
    context: {
      pilot_transcript: 'Runway three zero left, cleared for takeoff',
      session_history: createSessionHistory([
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, runway three zero left, cleared for takeoff', 'TWR', 'HOLD_SHORT'),
      ]),
      current_phase_info: createPhaseInfo('HOLD_SHORT'),
      context: createContext(),
    },
    expectations: {
      scoreRange: { min: 1, max: 2 },
      feedbackPatterns: [/missing\s+callsign/i, /(runway|takeoff)/i],
      perfectExamplePatterns: [/cessna.*one.*two.*three/i],
    },
  },

  // =========================================================================
  // READBACK VERIFICATION TESTS
  // =========================================================================
  {
    name: 'READBACK - Correct taxi clearance readback',
    description: 'Pilot correctly reads back taxi clearance with all elements',
    context: {
      pilot_transcript: 'Taxi to runway three zero left via Hotel, Zulu, hold short runway three zero left, Cessna One Two Three Alpha Bravo',
      session_history: createSessionHistory([
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, taxi to runway three zero left via Hotel, Zulu, hold short runway three zero left', 'GND', 'PARKING_STARTUP'),
      ]),
      current_phase_info: createPhaseInfo('PARKING_STARTUP'),
      context: createContext(),
    },
    expectations: {
      expectedScore: 5,
      feedbackPatterns: [/perfect|excellent|correct/i, /readback/i],
    },
  },
  {
    name: 'READBACK - Correct landing clearance readback',
    description: 'Pilot correctly reads back landing clearance',
    context: {
      pilot_transcript: 'Runway three zero left, cleared to land, Cessna One Two Three Alpha Bravo',
      session_history: createSessionHistory([
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, runway three zero left, cleared to land', 'TWR', 'TRAFFIC_PATTERN'),
      ]),
      current_phase_info: createPhaseInfo('TRAFFIC_PATTERN'),
      context: createContext(),
    },
    expectations: {
      expectedScore: 5,
      feedbackPatterns: [/perfect|excellent|correct/i],
      perfectExamplePatterns: [/cleared.*land/i],
    },
  },

  // =========================================================================
  // DIFFERENT PHASES
  // =========================================================================
  {
    name: 'TAXI_OUT - Tower handoff acknowledgment',
    description: 'Pilot acknowledges tower handoff instruction',
    context: {
      pilot_transcript: 'Contact Tower one one niner point seven, Cessna One Two Three Alpha Bravo',
      session_history: createSessionHistory([
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, contact Tower one one niner point seven', 'GND', 'TAXI_OUT'),
      ]),
      current_phase_info: createPhaseInfo('TAXI_OUT'),
      context: createContext(),
    },
    expectations: {
      expectedScore: 5,
      feedbackPatterns: [/perfect|excellent|correct/i],
    },
  },
  {
    name: 'LANDED - Ground handoff readback',
    description: 'Pilot correctly reads back exit instructions and ground handoff',
    context: {
      pilot_transcript: 'Turn left at Bravo, contact Ground point seven, Cessna One Two Three Alpha Bravo',
      session_history: createSessionHistory([
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, turn left at Bravo, contact Ground point seven', 'TWR', 'LANDED'),
      ]),
      current_phase_info: createPhaseInfo('LANDED'),
      context: createContext(),
    },
    expectations: {
      expectedScore: 5,
      feedbackPatterns: [/perfect|excellent|correct/i],
    },
  },

  // =========================================================================
  // FREQUENCY MISMATCH TESTS
  // =========================================================================
  {
    name: 'FREQUENCY - Calling Tower on Ground frequency',
    description: 'Pilot calls Tower while still on Ground frequency (should be score 2-3)',
    context: {
      pilot_transcript: 'San Jose Tower, Cessna One Two Three Alpha Bravo, holding short runway three zero left, ready for departure',
      session_history: createSessionHistory([
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, taxi to runway three zero left via Hotel, Zulu, hold short runway three zero left', 'GND', 'TAXI_OUT'),
      ]),
      current_phase_info: createPhaseInfo('HOLD_SHORT'),
      context: createContext(),
    },
    expectations: {
      scoreRange: { min: 2, max: 3 },
      feedbackPatterns: [/(frequency|tower|ground)/i, /(wrong|error|situational awareness|wait)/i],
      perfectExamplePatterns: [/ground/i, /holding short/i],
    },
  },
  {
    name: 'FREQUENCY - Calling Ground on Tower frequency',
    description: 'Pilot calls Ground while still on Tower frequency after landing',
    context: {
      pilot_transcript: 'San Jose Ground, Cessna One Two Three Alpha Bravo, clear of runway three zero left',
      session_history: createSessionHistory([
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, runway three zero left, cleared to land', 'TWR', 'TRAFFIC_PATTERN'),
      ]),
      current_phase_info: createPhaseInfo('LANDED'),
      context: createContext(),
    },
    expectations: {
      scoreRange: { min: 2, max: 3 },
      feedbackPatterns: [/(frequency|tower|ground)/i, /(stay|remain|exit)/i],
      perfectExamplePatterns: [/clear.*runway|cessna/i],
    },
  },
  {
    name: 'FREQUENCY - Calling wrong facility during taxi',
    description: 'Pilot calls Tower during taxi when should still be with Ground',
    context: {
      pilot_transcript: 'San Jose Tower, Cessna One Two Three Alpha Bravo, approaching runway three zero left',
      session_history: createSessionHistory([
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, taxi to runway three zero left via Hotel, Zulu', 'GND', 'TAXI_OUT'),
      ]),
      current_phase_info: createPhaseInfo('TAXI_OUT'),
      context: createContext(),
    },
    expectations: {
      scoreRange: { min: 2, max: 3 },
      feedbackPatterns: [/(frequency|tower|ground)/i, /(handoff|contact|wait)/i],
    },
  },

  // =========================================================================
  // ADDITIONAL PHRASEOLOGY AND READBACK TESTS
  // =========================================================================
  {
    name: 'PHRASEOLOGY - Non-standard but understandable',
    description: 'Pilot uses non-standard phraseology but communication is clear (score 3-4)',
    context: {
      pilot_transcript: 'Ground, this is Cessna One Two Three Alpha Bravo, we got information Charlie and want to taxi please',
      session_history: [],
      current_phase_info: createPhaseInfo('PARKING_STARTUP'),
      context: createContext(),
    },
    expectations: {
      scoreRange: { min: 3, max: 4 },
      feedbackPatterns: [/(phraseology|standard|say|with information|request)/i],
      perfectExamplePatterns: [/request taxi|ground.*cessna/i],
    },
  },
  {
    name: 'PHRASEOLOGY - Using "roger" instead of proper readback',
    description: 'Pilot says "roger" instead of reading back clearance (score 2-3)',
    context: {
      pilot_transcript: 'Roger, Cessna One Two Three Alpha Bravo',
      session_history: createSessionHistory([
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, taxi to runway three zero left via Alpha, Bravo', 'GND', 'PARKING_STARTUP'),
      ]),
      current_phase_info: createPhaseInfo('PARKING_STARTUP'),
      context: createContext(),
    },
    expectations: {
      scoreRange: { min: 2, max: 3 },
      feedbackPatterns: [/(roger|readback|read back|repeat)/i],
      perfectExamplePatterns: [/taxi.*runway.*two.*eight/i, /alpha.*bravo/i],
    },
  },
  {
    name: 'READBACK - Partial readback missing hold short',
    description: 'Pilot reads back taxi route but omits critical hold short instruction',
    context: {
      pilot_transcript: 'Taxi to runway three zero left via Alpha, Bravo, Cessna One Two Three Alpha Bravo',
      session_history: createSessionHistory([
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, taxi to runway three zero left via Alpha, Bravo, hold short runway three zero left', 'GND', 'PARKING_STARTUP'),
      ]),
      current_phase_info: createPhaseInfo('PARKING_STARTUP'),
      context: createContext(),
    },
    expectations: {
      scoreRange: { min: 2, max: 3 },
      feedbackPatterns: [/(hold short|missing|omitted|critical)/i],
      perfectExamplePatterns: [/hold short/i],
    },
  },
  {
    name: 'READBACK - Correct LUAW readback',
    description: 'Pilot correctly reads back line up and wait instruction',
    context: {
      pilot_transcript: 'Runway three zero left, line up and wait, Cessna One Two Three Alpha Bravo',
      session_history: createSessionHistory([
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, runway three zero left, line up and wait', 'TWR', 'HOLD_SHORT'),
      ]),
      current_phase_info: createPhaseInfo('HOLD_SHORT'),
      context: createContext(),
    },
    expectations: {
      expectedScore: 5,
      feedbackPatterns: [/perfect|excellent|correct/i],
      perfectExamplePatterns: [/line up and wait/i],
    },
  },
  {
    name: 'READBACK - Wrong taxiway in readback',
    description: 'Pilot reads back wrong taxiway designation (score 2)',
    context: {
      pilot_transcript: 'Taxi to runway three zero left via Charlie, Delta, hold short three zero left, Cessna One Two Three Alpha Bravo',
      session_history: createSessionHistory([
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, taxi to runway three zero left via Alpha, Bravo, hold short runway three zero left', 'GND', 'PARKING_STARTUP'),
      ]),
      current_phase_info: createPhaseInfo('PARKING_STARTUP'),
      context: createContext(),
    },
    expectations: {
      scoreRange: { min: 1, max: 2 },
      feedbackPatterns: [/(wrong|incorrect|taxiway|alpha|bravo)/i],
      perfectExamplePatterns: [/alpha.*bravo/i],
    },
  },

  // =========================================================================
  // DIFFERENT PHASE SCENARIOS
  // =========================================================================
  {
    name: 'EMERGENCY - Declaring emergency properly',
    description: 'Pilot declares emergency with proper format and information',
    context: {
      pilot_transcript: 'San Jose Tower, Cessna One Two Three Alpha Bravo, declaring emergency, engine failure, three souls on board, returning to field',
      session_history: [],
      current_phase_info: createPhaseInfo('EMERGENCY'),
      context: createContext(),
    },
    expectations: {
      expectedScore: 5,
      feedbackPatterns: [/perfect|excellent|emergency|souls/i],
    },
  },
  {
    name: 'EMERGENCY - Missing critical information',
    description: 'Pilot declares emergency but missing souls on board',
    context: {
      pilot_transcript: 'Tower, Cessna One Two Three Alpha Bravo, emergency, engine problem',
      session_history: [],
      current_phase_info: createPhaseInfo('EMERGENCY'),
      context: createContext(),
    },
    expectations: {
      scoreRange: { min: 2, max: 3 },
      feedbackPatterns: [/(souls|fuel|nature|assistance)/i],
    },
  },
  {
    name: 'CRUISING - Pattern entry request',
    description: 'Pilot requests to enter pattern from cruise',
    context: {
      pilot_transcript: 'San Jose Tower, Cessna One Two Three Alpha Bravo, ten miles north with information Delta, inbound for landing',
      session_history: [],
      current_phase_info: createPhaseInfo('CRUISING'),
      context: createContext(),
    },
    expectations: {
      scoreRange: { min: 4, max: 5 },
      feedbackPatterns: [/(good|excellent|position|ATIS)/i],
    },
  },

  // =========================================================================
  // CALLSIGN VARIATIONS
  // =========================================================================
  {
    name: 'CALLSIGN - Abbreviated callsign after initial contact',
    description: 'Pilot uses abbreviated callsign after full callsign established',
    context: {
      pilot_transcript: 'Taxi to runway three zero left via Alpha, three alpha bravo',
      session_history: createSessionHistory([
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, taxi to runway three zero left via Alpha', 'GND', 'PARKING_STARTUP'),
        createTransmissionEvent('San Jose Ground, Cessna November One Two Three Alpha Bravo, with information Charlie, request taxi', 'PILOT', 'PARKING_STARTUP'),
      ]),
      current_phase_info: createPhaseInfo('PARKING_STARTUP'),
      context: createContext(),
    },
    expectations: {
      scoreRange: { min: 4, max: 5 },
      feedbackPatterns: [/(good|acceptable|abbreviated)/i],
    },
  },
  {
    name: 'CALLSIGN - Callsign in middle instead of end',
    description: 'Pilot puts callsign in middle of readback instead of at end',
    context: {
      pilot_transcript: 'Cessna One Two Three Alpha Bravo, runway three zero left, cleared for takeoff',
      session_history: createSessionHistory([
        createTransmissionEvent('Cessna One Two Three Alpha Bravo, runway three zero left, cleared for takeoff', 'TWR', 'HOLD_SHORT'),
      ]),
      current_phase_info: createPhaseInfo('HOLD_SHORT'),
      context: createContext(),
    },
    expectations: {
      scoreRange: { min: 1, max: 2 },
      feedbackPatterns: [/(callsign|end|position)/i],
      perfectExamplePatterns: [/cleared.*takeoff.*cessna/i],
    },
  },

  // =========================================================================
  // EDGE CASES
  // =========================================================================
  {
    name: 'EDGE - Empty history with good initial contact',
    description: 'First transmission should be evaluated as initial contact',
    context: {
      pilot_transcript: 'San Jose Tower, Cessna November One Two Three Alpha Bravo, holding short runway three zero left, ready for departure',
      session_history: [],
      current_phase_info: createPhaseInfo('HOLD_SHORT'),
      context: createContext(),
    },
    expectations: {
      scoreRange: { min: 4, max: 5 },
      feedbackPatterns: [/(good|excellent|perfect)/i],
    },
  },
  {
    name: 'EDGE - Very long correct transmission',
    description: 'Pilot provides complete but verbose transmission',
    context: {
      pilot_transcript: 'San Jose Ground, this is Cessna November One Two Three Alpha Bravo with the current ATIS information Charlie, we are at the ramp and requesting taxi clearance to runway three zero left for departure',
      session_history: [],
      current_phase_info: createPhaseInfo('PARKING_STARTUP'),
      context: createContext(),
    },
    expectations: {
      scoreRange: { min: 4, max: 5 },
      feedbackPatterns: [/(good|complete|concise|brief)/i],
    },
  },
];

/**
 * Helper to validate evaluation response
 */
function validateResponse(
  testCase: EvaluationTestCase,
  response: { feedback_score: number; feedback_comment: string; perfect_example: string }
) {
  try {
    const { expectations } = testCase;

    // Basic structure validation
    expect(response).toHaveProperty('feedback_score');
    expect(response).toHaveProperty('feedback_comment');
    expect(response).toHaveProperty('perfect_example');
    expect(typeof response.feedback_score).toBe('number');
    expect(typeof response.feedback_comment).toBe('string');
    expect(typeof response.perfect_example).toBe('string');

    // Score validation
    expect(response.feedback_score).toBeGreaterThanOrEqual(1);
    expect(response.feedback_score).toBeLessThanOrEqual(5);

    // Check exact score or range
    if (expectations.expectedScore !== undefined) {
      expect(response.feedback_score).toBe(expectations.expectedScore);
    } else if (expectations.scoreRange) {
      expect(response.feedback_score).toBeGreaterThanOrEqual(expectations.scoreRange.min);
      expect(response.feedback_score).toBeLessThanOrEqual(expectations.scoreRange.max);
    }

    // Feedback should not be empty
    expect(response.feedback_comment.length).toBeGreaterThan(10);
    expect(response.perfect_example.length).toBeGreaterThan(5);

    // Check feedback patterns
    if (expectations.feedbackPatterns) {
      for (const pattern of expectations.feedbackPatterns) {
        expect(
          response.feedback_comment,
          `Feedback should match pattern: ${pattern}`
        ).toMatch(pattern);
      }
    }

    // Check forbidden feedback patterns
    if (expectations.forbiddenFeedbackPatterns) {
      for (const pattern of expectations.forbiddenFeedbackPatterns) {
        expect(
          response.feedback_comment,
          `Feedback should NOT contain: ${pattern}`
        ).not.toMatch(pattern);
      }
    }

    // Check perfect example patterns
    if (expectations.perfectExamplePatterns) {
      for (const pattern of expectations.perfectExamplePatterns) {
        expect(
          response.perfect_example,
          `Perfect example should match pattern: ${pattern}`
        ).toMatch(pattern);
      }
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
      context: {
        pilot_transcript: testCase.context.pilot_transcript,
        session_history: testCase.context.session_history,
        current_phase: testCase.context.current_phase_info.current_phase,
        context: testCase.context.context,
      },
      expectations: testCase.expectations,
    }, null, 2));
    console.error('\n📤 OUTPUT (Response):');
    console.error(JSON.stringify({
      feedback_score: response.feedback_score,
      feedback_comment: response.feedback_comment,
      perfect_example: response.perfect_example,
    }, null, 2));
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
describe('PilotCommunicationEvaluationService Regression Tests', () => {
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
        console.log(`Phase: ${testCase.context.current_phase_info.current_phase}`);
        console.log(`Pilot: "${testCase.context.pilot_transcript}"`);
        console.log(`${'='.repeat(70)}\n`);
      }

      // Call the service
      const response = await PilotCommunicationEvaluationService.evaluatePilotCommunication(
        testCase.context,
        logger
      );

      if (process.env.TEST_VERBOSE) {
        console.log(`Score: ${response.feedback_score}/5`);
        console.log(`Feedback: "${response.feedback_comment}"`);
        console.log(`Perfect Example: "${response.perfect_example}"`);
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
    it('should generate consistent scores for identical inputs', async () => {
      const testCase = TEST_CASES[0]; // Use first test case (excellent communication)
      const runs = 3;
      const scores: number[] = [];

      for (let i = 0; i < runs; i++) {
        const response = await PilotCommunicationEvaluationService.evaluatePilotCommunication(
          testCase.context,
          logger
        );
        scores.push(response.feedback_score);
      }

      // All scores should be the same (or very close for excellent cases)
      const uniqueScores = [...new Set(scores)];
      expect(uniqueScores.length).toBeLessThanOrEqual(2); // Allow slight variance

      if (process.env.TEST_VERBOSE) {
        console.log('\nConsistency Test Results:');
        scores.forEach((s, i) => {
          console.log(`  Run ${i + 1}: Score ${s}/5`);
        });
      }
    }, 90000); // 90 second timeout for 3 runs
  });

  // =========================================================================
  // SCORE DISTRIBUTION TEST
  // =========================================================================
  describe('Score Distribution', () => {
    it('should use full score range (1-5)', async () => {
      const scoresReceived = new Set<number>();

      // Run a subset of tests that cover different score ranges
      const diverseTests = [
        TEST_CASES[0], // Score 5 (Excellent)
        TEST_CASES[5], // Score 3 (Adequate)
        TEST_CASES[8], // Score 1 (Unacceptable - wrong runway)
      ];

      for (const testCase of diverseTests) {
        const response = await PilotCommunicationEvaluationService.evaluatePilotCommunication(
          testCase.context,
          logger
        );
        scoresReceived.add(response.feedback_score);
      }

      // Should have at least 3 different scores
      expect(scoresReceived.size).toBeGreaterThanOrEqual(3);

      if (process.env.TEST_VERBOSE) {
        console.log('\nScore Distribution Test:');
        console.log(`Unique scores received: ${Array.from(scoresReceived).sort().join(', ')}`);
      }
    }, 90000);
  });
});
