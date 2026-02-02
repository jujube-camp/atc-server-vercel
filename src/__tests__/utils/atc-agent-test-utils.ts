import { expect } from 'vitest';
import type { AtcAgentContext, AtcAgentResponse } from '../../services/atcAgentService.js';
import { buildAgentContextSync } from '../../utils/agentContextHelper.js';
import { getFsmGraph, FlightModeId, toPhaseName } from '../../common/index.js';
import { REAL_KSJC_AIRPORT_INFO } from './test-helpers.js';

// Default FSM graph for tests (VFR mode)
export const DEFAULT_FSM_GRAPH = getFsmGraph(FlightModeId.VFR);

// Default test constants
export const DEFAULT_AIRPORT_ICAO = 'KSJC';
export const DEFAULT_AIRCRAFT_TAIL_NUMBER = 'N123AB';

/**
 * Helper to build AtcAgentContext using buildAgentContextSync (same as production)
 * This ensures test context matches production exactly
 */
export function buildTestContext(
  phaseName: string,
  sessionHistory: string[],
  triggerInput: string,
  options?: {
    userSelectedFrequencyType?: string | null;
    currentLocation?: string;
    triggerType?: 'pilot_speech' | 'phase_entry';
    flightModeId?: FlightModeId;
  }
): AtcAgentContext {
  const fsmGraph = options?.flightModeId 
    ? getFsmGraph(options.flightModeId)
    : DEFAULT_FSM_GRAPH;
  
  // Convert string to PhaseName (validates and casts)
  const validatedPhaseName = toPhaseName(phaseName);
  
  const baseContext = buildAgentContextSync(
    fsmGraph,
    validatedPhaseName,
    DEFAULT_AIRPORT_ICAO,
    DEFAULT_AIRCRAFT_TAIL_NUMBER,
    REAL_KSJC_AIRPORT_INFO,
    sessionHistory,
    {
      userSelectedFrequencyType: options?.userSelectedFrequencyType,
      currentLocation: options?.currentLocation,
    }
  );

  return {
    ...baseContext,
    trigger_input: triggerInput,
    trigger_type: options?.triggerType || 'pilot_speech',
  } as AtcAgentContext;
}

/**
 * Test case structure for AtcAgentService
 */
export interface AtcAgentTestCase {
  name: string;
  description: string;
  context: AtcAgentContext;
  expectations: {
    // Should ATC respond or stay silent?
    shouldRespond: boolean;
    
    // If responding, what patterns should be in the message?
    messagePatterns?: RegExp[];
    
    // What patterns should NOT be in the message?
    forbiddenPatterns?: RegExp[];
    
    // Minimum message length if responding
    minLength?: number;
  };
}

/**
 * Normalize message for pattern matching: remove punctuation and convert to lowercase
 */
export function normalizeMessage(message: string): string {
  return message
    .toLowerCase()
    .replace(/[.,!?;:()\[\]{}'"]/g, ' ') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Helper to validate ATC response
 */
export function validateResponse(
  testCase: AtcAgentTestCase,
  response: AtcAgentResponse
) {
  try {
    const { expectations } = testCase;
    const atcMessage = response.message ?? '';
    const normalizedMessage = normalizeMessage(atcMessage);

    // Basic structure validation
    expect(response).toHaveProperty('message');
    expect(response).toHaveProperty('expected');
    expect(typeof response.message).toBe('string');
    expect(typeof response.expected).toBe('boolean');

    // Phraseology validation: Check for placeholders/brackets in ALL non-empty messages
    if (atcMessage.length > 0) {
      const forbiddenPhraseologyPatterns = [
        /\[.*\]/,        // [runway], [taxiway] - check original (brackets removed in normalization)
        /\{.*\}/,        // {value} - check original (braces removed in normalization)
        /tbd|todo|xxx/i, // Placeholder text - check normalized
        /<.*>/,          // <placeholder> - check original (angle brackets removed in normalization)
        /\b\d+[a-z]{1,2}\b/i, // Invalid tail numbers like "123ab", "12l" - check normalized
      ];

      for (const pattern of forbiddenPhraseologyPatterns) {
        // Use original message for bracket/brace patterns, normalized for text patterns
        const messageToCheck = pattern.source.includes('[') || pattern.source.includes('{') || pattern.source.includes('<')
          ? atcMessage
          : normalizedMessage;
        expect(
          messageToCheck,
          `Message should not contain placeholder pattern: ${pattern}`
        ).not.toMatch(pattern);
      }
    }

    if (expectations.shouldRespond) {
      // Should have a message
      expect(atcMessage.length).toBeGreaterThan(0);
      
      // Check minimum length
      if (expectations.minLength) {
        expect(atcMessage.length).toBeGreaterThanOrEqual(expectations.minLength);
      }

      // Check required patterns (normalized message for robust matching)
      if (expectations.messagePatterns) {
        for (const pattern of expectations.messagePatterns) {
          expect(
            normalizedMessage,
            `Message should match pattern: ${pattern} (normalized: "${normalizedMessage}")`
          ).toMatch(pattern);
        }
      }

      // Check forbidden patterns (normalized message for robust matching)
      if (expectations.forbiddenPatterns) {
        for (const pattern of expectations.forbiddenPatterns) {
          expect(
            normalizedMessage,
            `Message should NOT contain: ${pattern} (normalized: "${normalizedMessage}")`
          ).not.toMatch(pattern);
        }
      }
    } else {
      // Should be silent (empty string)
      expect(atcMessage).toBe('');
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
        static_context: testCase.context.static_context,
        current_phase_info: testCase.context.current_phase_info,
        dynamic_context: testCase.context.dynamic_context,
        trigger_input: testCase.context.trigger_input,
      },
      expectations: testCase.expectations,
    }, null, 2));
    console.error('\n📤 OUTPUT (Response):');
    const outputPayload: Record<string, unknown> = {
      message: response.message,
      expected: response.expected,
    };
    if ('notes' in response) {
      outputPayload.notes = (response as any).notes;
    }
    console.error(JSON.stringify(outputPayload, null, 2));
    console.error('\n❌ Error:');
    console.error(error);
    console.error('='.repeat(80) + '\n');
    
    // Re-throw the error so the test still fails
    throw error;
  }
}

/**
 * Timing data structure
 */
export interface TimingData {
  testName: string;
  durationMs: number;
}

