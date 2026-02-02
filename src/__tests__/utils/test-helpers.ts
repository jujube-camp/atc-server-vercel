/**
 * Shared test helpers for regression tests
 * 
 * Provides common utilities for creating test contexts, airport info, and history transcripts
 * across all agent regression test suites.
 */

import { getFsmGraph, FlightModeId, type PhaseName, toPhaseName } from '../../common/index.js';
import type { TransmissionEventHistory, PhaseAdvanceEventHistory, SessionEventHistory } from '../../services/sessionHistoryService.js';
import { eventToString } from '../../services/sessionHistoryService.js';

/**
 * Helper to create current_phase_info context from phase name
 * Builds the structure expected by LLM agents
 * Uses VFR flight mode by default (contains all phases)
 */
export function createPhaseInfo(phaseName: PhaseName, flightModeId: FlightModeId = FlightModeId.VFR) {
  const fsmGraph = getFsmGraph(flightModeId);
  const state = fsmGraph.getState(phaseName);
  return {
    current_phase: state.id,
    label: state.label,
    atc_guidance: state.atc_guidance,
  };
}

/**
 * Real KSJC airport info for regression tests
 */
export const REAL_KSJC_AIRPORT_INFO = JSON.stringify({
  airport: {
    icao: 'KSJC',
    name: 'Norman Y. Mineta San Jose International Airport',
    location: {
      city: 'San Jose',
      region: 'US-CA',
      country: 'US',
    },
  },
  runways: [
    { length_ft: 4599, width_ft: 100, surface: 'ASP', closed: '1' },
    { length_ft: 11000, width_ft: 150, surface: 'CON', closed: '0' },
    {
      length_ft: 11000,
      width_ft: 150,
      surface: 'CON',
      closed: '0',
      he_ils: { freq: 110.9, course: 306 },
      le_ils: { freq: 110.9, course: 126 },
    },
  ],
  freqs: {
    APP: ['33.82', '120.1'],
    ATIS: '126.95',
    CLD: '118',
    CTAF: '124',
    DEP: '121.3',
    GND: '121.7',
    TWR: '124',
  },
});

/**
 * Helper to create dynamic context with history and last ATC instruction
 * @param events - Array of session event objects (oldest to newest)
 * @param userSelectedFrequencyType - The user's selected frequency type (e.g., 'GND', 'TWR', 'CTAF/TWR')
 * @returns Dynamic context with session_history generated using eventToString
 */
export function createDynamicContext(
  events: SessionEventHistory[],
  userSelectedFrequencyType: string
) {
  const history = createSessionHistory(events);
  return {
    user_selected_frequency_type: userSelectedFrequencyType,
    session_history: history,
  };
}

/**
 * Helper to create standard static context
 * Always uses KSJC airport with real airport info
 */
export function createStaticContext() {
  return {
    airport_icao: 'KSJC',
    aircraft_tail_number: 'N123AB',
    airport_info: REAL_KSJC_AIRPORT_INFO,
  };
}


/**
 * Helper to create session history strings from event objects
 * This ensures all test history uses eventToString for consistency
 * @param events - Array of event objects (oldest to newest, must be pre-sorted by caller)
 * @returns Array of event strings in chronological order (oldest first, newest last)
 */
export function createSessionHistory(events: SessionEventHistory[]): string[] {
  if (events.length === 0) {
    return [];
  }

  return events.map((event, index) => eventToString(event, index + 1));
}

/**
 * Helper to create a transmission event
 * @param transcript - The audio transcript text
 * @param sender - The sender type: 'PILOT' for pilot transmissions, or a frequency type like 'GND', 'TWR', etc. for ATC
 * @param phaseName - The phase name for the event
 * @param metadata - Optional metadata string (JSON)
 * @param timestamp - Optional timestamp (defaults to now)
 */
export function createTransmissionEvent(
  transcript: string,
  sender: 'PILOT' | 'TWR' | 'GND' | 'DEP' | 'APP' | 'CTR' | 'UNKNOWN',
  phaseName: string | PhaseName,
  metadata: string | null = null,
  timestamp?: Date
): TransmissionEventHistory {
  const validatedPhaseName = toPhaseName(phaseName);
  return {
    type: 'transmission',
    timestamp: timestamp || new Date(),
    phase_id: validatedPhaseName as any, // Use phase name directly (database stores as string)
    audio_transcript: transcript,
    sender,
    metadata,
  };
}

/**
 * Helper to create a phase advance event
 * @param fromPhase - The phase being advanced from
 * @param toPhase - The phase being advanced to
 * @param timestamp - Optional timestamp (defaults to now)
 */
export function createPhaseAdvanceEvent(
  fromPhase: string | PhaseName,
  toPhase: string | PhaseName,
  timestamp?: Date
): PhaseAdvanceEventHistory {
  return {
    type: 'phase_advance',
    timestamp: timestamp || new Date(),
    from_phase: toPhaseName(fromPhase) as any, // Use phase name directly (database stores as string)
    to_phase: toPhaseName(toPhase) as any, // Use phase name directly (database stores as string)
  };
}

