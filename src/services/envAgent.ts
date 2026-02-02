import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// Situation Types
// ============================================================================

export type TakeoffSituationType =
  | "TAKEOFF_CLEAR"           // Runway clear for takeoff
  | "TAKEOFF_OCCUPIED"        // Runway blocked, hold position
  | "TAKEOFF_LUAW";           // Line up and wait, departure rolling

export type LandingSituationType =
  | "LANDING_CLEAR"                // Runway clear, cleared to land
  | "LANDING_SHORT_FINAL_SEQ_1"    // Traffic on short final, you're #2
  | "LANDING_EXTEND_DOWNWIND"      // Extend downwind for spacing
  | "LANDING_BLOCKED";             // Runway blocked, go around

export type RunwaySituationType = TakeoffSituationType | LandingSituationType;

export interface TakeoffSituation {
  situation: TakeoffSituationType;
  notes?: string;
}

export interface LandingSituation {
  situation: LandingSituationType;
  notes?: string;
}

export interface ExpectedRunway {
  runway: string;           // e.g., "27L", "09R"
  pattern: 'left' | 'right';
  notes?: string;
}

export interface EnvAgent {
  getTakeoffSituation(currentState?: string): TakeoffSituation | Promise<TakeoffSituation>;
  getLandingSituation(currentState?: string): LandingSituation | Promise<LandingSituation>;
  getExpectedRunway(): ExpectedRunway | Promise<ExpectedRunway>;
}

// Airport runway info passed to EnvAgent
export interface AirportRunwayInfo {
  runways: Array<{
    le_ident: string;  // e.g., "09", "09L"
    he_ident: string;  // e.g., "27", "27R"
  }>;
}

// ============================================================================
// Situation Notes (for LLM context)
// ============================================================================

const SITUATION_NOTES: Record<RunwaySituationType, string> = {
  // Takeoff
  TAKEOFF_CLEAR: "Runway is clear for takeoff operations",
  TAKEOFF_OCCUPIED: "Runway is occupied; hold position, no takeoff clearance",
  TAKEOFF_LUAW: "Traffic departing; line up and wait, be ready for immediate takeoff",
  // Landing
  LANDING_CLEAR: "Runway is clear; cleared to land or cleared for the option",
  LANDING_SHORT_FINAL_SEQ_1: "Traffic on short final; you're number two, follow traffic, cleared to land or cleared for the option",
  LANDING_EXTEND_DOWNWIND: "Extend downwind for spacing; will call your base",
  LANDING_BLOCKED: "Runway blocked; If aircraft is on final approach, go around. If aircraft is in traffic pattern or straight-in, switch to a different parallel/same-direction runway( explicitly stating switching the current runway is not available, and switch to a different runway. Otherwise, Make a right/left 360 turn for spacing.",
};

// ============================================================================
// RULES: Valid Situations per Phase
// ============================================================================

const TAKEOFF_VALID_SITUATIONS: Record<string, TakeoffSituationType[]> = {
  HOLD_SHORT: ['TAKEOFF_CLEAR', 'TAKEOFF_OCCUPIED', 'TAKEOFF_LUAW'],
};

const LANDING_VALID_SITUATIONS: Record<string, LandingSituationType[]> = {
  TRAFFIC_PATTERN: ['LANDING_CLEAR', 'LANDING_SHORT_FINAL_SEQ_1', 'LANDING_EXTEND_DOWNWIND', 'LANDING_BLOCKED'],
  STRAIGHT_IN: ['LANDING_CLEAR', 'LANDING_SHORT_FINAL_SEQ_1', 'LANDING_BLOCKED'],
  PATTERN_ENTRY: ['LANDING_CLEAR', 'LANDING_SHORT_FINAL_SEQ_1', 'LANDING_EXTEND_DOWNWIND', 'LANDING_BLOCKED'],
};

// Default patterns
const DEFAULT_PATTERNS: Array<'left' | 'right'> = ['left', 'right'];

// Fallback runway if no airport info provided (default to runway 12)
const FALLBACK_RUNWAYS = ['12'];

/**
 * Extract all runway identifiers from airport info
 * Returns both le_ident and he_ident for each runway
 */
function extractRunways(airportInfo?: AirportRunwayInfo): string[] {
  if (!airportInfo?.runways?.length) {
    return FALLBACK_RUNWAYS;
  }
  
  const runways: string[] = [];
  for (const runway of airportInfo.runways) {
    if (runway.le_ident) runways.push(runway.le_ident);
    if (runway.he_ident) runways.push(runway.he_ident);
  }
  
  return runways.length > 0 ? runways : FALLBACK_RUNWAYS;
}

// ============================================================================
// RULES: Transition Targets (what a situation can become)
// ============================================================================

const TRANSITION_TARGETS: Record<RunwaySituationType, RunwaySituationType[]> = {
  // Takeoff - clear stays clear, others can clear
  TAKEOFF_CLEAR: [],  // No transition, already optimal
  TAKEOFF_OCCUPIED: ['TAKEOFF_CLEAR', 'TAKEOFF_LUAW'],
  TAKEOFF_LUAW: ['TAKEOFF_CLEAR'],
  
  // Landing - clear stays clear, others progress toward clear
  LANDING_CLEAR: [],  // No transition, already optimal
  LANDING_SHORT_FINAL_SEQ_1: ['LANDING_CLEAR'],
  LANDING_EXTEND_DOWNWIND: ['LANDING_CLEAR', 'LANDING_SHORT_FINAL_SEQ_1'],
  LANDING_BLOCKED: ['LANDING_CLEAR'],
};

// ============================================================================
// Probabilities for Random Selection
// ============================================================================

const SITUATION_PROBABILITIES: Record<RunwaySituationType, number> = {
  TAKEOFF_CLEAR: 0.45,
  TAKEOFF_OCCUPIED: 0.1,
  TAKEOFF_LUAW: 0.45,
  LANDING_CLEAR: 0.4,
  LANDING_SHORT_FINAL_SEQ_1: 0.25,
  LANDING_EXTEND_DOWNWIND: 0.15,
  LANDING_BLOCKED: 0.2,
};

// ============================================================================
// Helpers
// ============================================================================

function getValidTakeoffSituations(phase: string): TakeoffSituationType[] {
  return TAKEOFF_VALID_SITUATIONS[phase] || ['TAKEOFF_CLEAR'];
}

function getValidLandingSituations(phase: string): LandingSituationType[] {
  return LANDING_VALID_SITUATIONS[phase] || ['LANDING_CLEAR'];
}

function selectRandomPattern(): 'left' | 'right' {
  return DEFAULT_PATTERNS[Math.floor(Math.random() * DEFAULT_PATTERNS.length)];
}

function selectRandomSituation(validSituations: RunwaySituationType[]): RunwaySituationType {
  const totalWeight = validSituations.reduce((sum, s) => sum + SITUATION_PROBABILITIES[s], 0);
  const random = Math.random() * totalWeight;
  
  let cumulative = 0;
  for (const situation of validSituations) {
    cumulative += SITUATION_PROBABILITIES[situation];
    if (random <= cumulative) return situation;
  }
  return validSituations[0];
}

function selectTransition(currentSituation: RunwaySituationType, validForPhase: RunwaySituationType[]): RunwaySituationType | null {
  const possibleTransitions = TRANSITION_TARGETS[currentSituation];
  if (!possibleTransitions || possibleTransitions.length === 0) {
    return null; // No transition available (already clear)
  }
  
  // Filter to only transitions valid for this phase
  const validTransitions = possibleTransitions.filter(t => validForPhase.includes(t));
  if (validTransitions.length === 0) {
    return null;
  }
  
  // Random selection among valid transitions
  return validTransitions[Math.floor(Math.random() * validTransitions.length)];
}

// ============================================================================
// Phase Event Env Data Structure
// ============================================================================

interface SituationEnvData {
  situation: RunwaySituationType;
  hasChanged: boolean;
}

interface PhaseEnvData {
  takeoff?: SituationEnvData;
  landing?: SituationEnvData;
}

// ============================================================================
// Session State Structure (for runway only)
// ============================================================================

interface RunwayState {
  runway: string;
  pattern: 'left' | 'right';
}

interface SessionStateData {
  runway?: RunwayState;
}

// ============================================================================
// Stateful EnvAgent
// ============================================================================

/**
 * Stateful EnvAgent with generalized rules:
 * 
 * 1. Valid situations are defined per phase (PHASE_VALID_SITUATIONS)
 * 2. First call: random selection from valid situations
 * 3. Second call: if not "clear", transitions once (TRANSITION_TARGETS)
 * 4. Third+ call: returns saved (no more changes)
 * 5. Each PhaseAdvanceEvent tracks its own situation state via envData
 * 
 * Takeoff and Landing situations tracked independently per phase event.
 */

export class StatefulEnvAgent implements EnvAgent {
  private sessionId: string;
  private airportInfo?: AirportRunwayInfo;

  constructor(sessionId: string, airportInfo?: AirportRunwayInfo) {
    this.sessionId = sessionId;
    this.airportInfo = airportInfo;
  }

  async getTakeoffSituation(currentPhase?: string): Promise<TakeoffSituation> {
    const phase = currentPhase || 'HOLD_SHORT';
    const validSituations = getValidTakeoffSituations(phase);
    
    if (validSituations.length === 0) {
      return { situation: 'TAKEOFF_CLEAR', notes: SITUATION_NOTES['TAKEOFF_CLEAR'] };
    }

    return this.getSituation(phase, validSituations, 'takeoff') as Promise<TakeoffSituation>;
  }

  async getLandingSituation(currentPhase?: string): Promise<LandingSituation> {
    const phase = currentPhase || 'TRAFFIC_PATTERN';
    const validSituations = getValidLandingSituations(phase);
    
    if (validSituations.length === 0) {
      return { situation: 'LANDING_CLEAR', notes: SITUATION_NOTES['LANDING_CLEAR'] };
    }

    return this.getSituation(phase, validSituations, 'landing') as Promise<LandingSituation>;
  }

  async getExpectedRunway(): Promise<ExpectedRunway> {
    // Fetch session state to get or create runway assignment
    const sessionState = await prisma.sessionState.findUnique({
      where: { sessionId: this.sessionId }
    });
    const stateData = (sessionState?.data as SessionStateData) || {};
    
    // Return saved runway if exists (consistent throughout session)
    if (stateData.runway) {
      return {
        runway: stateData.runway.runway,
        pattern: stateData.runway.pattern,
        notes: `Expect runway ${stateData.runway.runway}, ${stateData.runway.pattern} traffic`,
      };
    }

    // Create new runway assignment using airport's actual runways
    const availableRunways = extractRunways(this.airportInfo);
    const runway = availableRunways[Math.floor(Math.random() * availableRunways.length)];
    const pattern = selectRandomPattern();
    
    // Save for session consistency
    const newData: SessionStateData = { ...stateData, runway: { runway, pattern } };
    await prisma.sessionState.upsert({
      where: { sessionId: this.sessionId },
      create: { sessionId: this.sessionId, data: newData as object },
      update: { data: newData as object },
    });

    return {
      runway,
      pattern,
      notes: `Expect runway ${runway}, ${pattern} traffic`,
    };
  }

  private async getSituation(
    phase: string,
    validSituations: RunwaySituationType[],
    stateKey: 'takeoff' | 'landing'
  ): Promise<{ situation: RunwaySituationType; notes?: string }> {
    // Get the latest PhaseAdvanceEvent where to_phase matches the current phase
    const phaseEvent = await prisma.phaseAdvanceEvent.findFirst({
      where: { sessionId: this.sessionId, to_phase: phase },
      orderBy: { createdAt: 'desc' },
    });

    if (!phaseEvent) {
      logger.error('No phase event found for phase: ${phase}');
      // No phase event found - return a random situation without persisting
      const situation = selectRandomSituation(validSituations);
      return { situation, notes: SITUATION_NOTES[situation] };
    }

    const envData = (phaseEvent.envData as PhaseEnvData) || {};
    const savedState = envData[stateKey];

    // Case 1: No saved state for this situation type → random selection
    if (!savedState) {
      const situation = selectRandomSituation(validSituations);
      await this.savePhaseEnvData(phaseEvent.id, envData, stateKey, { situation, hasChanged: false });
      return { situation, notes: SITUATION_NOTES[situation] };
    }

    // Case 2: Already changed → return saved
    if (savedState.hasChanged) {
      return { situation: savedState.situation, notes: SITUATION_NOTES[savedState.situation] };
    }

    // Case 3: Not changed yet → try transition
    const transition = selectTransition(savedState.situation, validSituations);
    
    if (transition) {
      // Transition available → apply it and mark as changed
      await this.savePhaseEnvData(phaseEvent.id, envData, stateKey, { situation: transition, hasChanged: true });
      return { situation: transition, notes: SITUATION_NOTES[transition] };
    }
    
    // No transition (already optimal) → return saved
    return { situation: savedState.situation, notes: SITUATION_NOTES[savedState.situation] };
  }

  private async savePhaseEnvData(
    phaseEventId: string,
    currentEnvData: PhaseEnvData,
    key: 'takeoff' | 'landing',
    state: SituationEnvData
  ): Promise<void> {
    const newEnvData: PhaseEnvData = { ...currentEnvData, [key]: state };
    await prisma.phaseAdvanceEvent.update({
      where: { id: phaseEventId },
      data: { envData: newEnvData as object },
    });
  }
}
