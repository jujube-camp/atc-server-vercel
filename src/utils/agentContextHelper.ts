/**
 * Shared context definitions and builders for LLM agents (ATC Agent, State Transition Agent)
 * 
 * Provides consistent context structures to maximize LLM performance and token caching.
 */

import type { FsmGraph, PhaseName } from '../common/fsm-data.js';
import { AirportService } from '../services/airportService.js';
import { normalizeAirportInfo } from './airportUtils.js';
import type { FastifyBaseLogger } from 'fastify';
import { logger as defaultLogger } from './logger.js';

/**
 * Static context that rarely changes during a session
 * Placed first in LLM requests for optimal token caching
 */
export interface AgentStaticContext {
  /** Flight mode information */
  flight_mode: {
    id: string;
    label: string;
    description: string;
  };
  /** Airport ICAO code */
  airport_icao: string;
  /** Aircraft tail number (callsign) */
  aircraft_tail_number: string;
  /** Airport info (frequencies, runways, etc.) */
  airport_info: string;
}

/**
 * Current phase information
 */
export interface AgentPhaseContext {
  current_phase: string;
  label: string;
  description: string;
  atc_guidance: {
    response_focus: string;
    examples?: string[];
    tower_initiate?: boolean;
  };
}

/**
 * Shared context structure for all agents
 * Extending agents can add specific fields (like available_transitions for State Transition Agent)
 */
export interface BaseAgentContext {
  // Static context (rarely changes) - placed first for token caching
  static_context: AgentStaticContext;
  
  // Current phase info (changes on phase transition)
  current_phase_info: AgentPhaseContext;
  
  // Dynamic context (changes every turn)
  dynamic_context: {
    session_history: string[]; // Shared history
    user_selected_frequency_type?: string | null;
    current_location?: string;
  };
}

/**
 * Get airport info JSON for agent context
 * @param airportIcao - Airport ICAO code
 * @param logger - Optional logger
 * @returns Airport info as JSON string, or "{}" if lookup fails
 */
export async function getAirportInfoForAgent(
  airportIcao: string,
  logger: FastifyBaseLogger = defaultLogger
): Promise<{ airportInfoJson: string; structuredInfo: ReturnType<typeof normalizeAirportInfo> | null }> {
  let airportInfoJson = "{}";
  let structuredInfo: ReturnType<typeof normalizeAirportInfo> | null = null;
  
  try {
    const airportInfo = await AirportService.getAirportByIcaoCode(airportIcao);
    structuredInfo = normalizeAirportInfo(airportInfo);
    airportInfoJson = JSON.stringify(structuredInfo);
  } catch (error) {
    logger.warn({ error, airportIcao }, '[agentContextHelper] Failed to get airport info');
  }
  
  return { airportInfoJson, structuredInfo };
}

/**
 * Get the effective airport ICAO for a session
 * Uses activeAirportIcao if set, otherwise falls back to airportIcao
 */
export function getEffectiveAirportIcao(
  airportIcao: string,
  activeAirportIcao?: string | null
): string {
  return activeAirportIcao || airportIcao;
}

/**
 * Build agent context with provided airport info (synchronous)
 * Use this when you already have airport info (e.g., in tests)
 */
export function buildAgentContextSync(
  fsmGraph: FsmGraph,
  currentPhase: PhaseName,
  airportIcao: string,
  aircraftTailNumber: string,
  airportInfoJson: string,
  sessionHistory: string[],
  dynamicOptions?: {
    userSelectedFrequencyType?: string | null;
    currentLocation?: string;
  }
): BaseAgentContext {
  const flightModeConfig = fsmGraph.getFlightModeConfig();
  const state = fsmGraph.getState(currentPhase);
  
  return {
    static_context: {
      flight_mode: {
        id: fsmGraph.modeId,
        label: flightModeConfig.label,
        description: flightModeConfig.description,
      },
      airport_icao: airportIcao,
      aircraft_tail_number: aircraftTailNumber,
      airport_info: airportInfoJson,
    },
    current_phase_info: {
      current_phase: state.id,
      label: state.label,
      description: state.description,
      atc_guidance: state.atc_guidance,
    },
    dynamic_context: {
      session_history: sessionHistory,
      user_selected_frequency_type: dynamicOptions?.userSelectedFrequencyType,
      current_location: dynamicOptions?.currentLocation,
    },
  };
}

/**
 * Build complete agent context (async - fetches airport info)
 */
export async function buildAgentContext(
  fsmGraph: FsmGraph,
  currentPhase: PhaseName,
  airportIcao: string,
  aircraftTailNumber: string,
  sessionHistory: string[],
  dynamicOptions?: {
    userSelectedFrequencyType?: string | null;
    currentLocation?: string;
  },
  logger?: FastifyBaseLogger
): Promise<BaseAgentContext> {
  const { airportInfoJson } = await getAirportInfoForAgent(airportIcao, logger);
  
  return buildAgentContextSync(
    fsmGraph,
    currentPhase,
    airportIcao,
    aircraftTailNumber,
    airportInfoJson,
    sessionHistory,
    dynamicOptions
  );
}

