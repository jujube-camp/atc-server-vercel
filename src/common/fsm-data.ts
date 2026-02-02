/**
 * FSM Data & Graph - Object-oriented FSM implementation
 * 
 * FsmData: Raw data holder loaded from fsm.yaml
 * FsmGraph: Graph built for a specific flight_mode with expansion and indexing
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * PhaseName enum - All valid FSM phase/state identifiers
 * Use this enum for type-safe phase references throughout the codebase
 */
export enum PhaseName {
  DUMMY_START = 'DUMMY_START', // Special phase for initial session advancement
  PARKING_STARTUP = 'PARKING_STARTUP',
  TAXI_OUT = 'TAXI_OUT',
  HOLD_SHORT = 'HOLD_SHORT',
  LINE_UP_AND_WAIT = 'LINE_UP_AND_WAIT',
  CLIMBING = 'CLIMBING',
  DEPARTURE = 'DEPARTURE',
  CRUISING = 'CRUISING',
  ARRIVAL = 'ARRIVAL',
  ENTER_AIRSPACE = 'ENTER_AIRSPACE',
  PATTERN_ENTRY = 'PATTERN_ENTRY',
  TRAFFIC_PATTERN = 'TRAFFIC_PATTERN',
  STRAIGHT_IN = 'STRAIGHT_IN',
  SHORT_FINAL = 'SHORT_FINAL',
  ROLLOUT = 'ROLLOUT',
  EMERGENCY = 'EMERGENCY',
  TAXI_BACK = 'TAXI_BACK',
  SHUTDOWN = 'SHUTDOWN',
}

/**
 * StateId is an alias for PhaseName for backward compatibility
 */
export type StateId = PhaseName;

/**
 * FlightModeId enum - All valid flight mode identifiers
 * Matches the flight_modes keys in fsm.yaml
 */
export enum FlightModeId {
  APPROACH = 'approach',
  EMERGENCY = 'emergency',
  TRAFFIC_PATTERN = 'traffic_pattern',
  VFR = 'vfr',
}

export type TransitionId = string;

/**
 * ATC guidance configuration for a state
 * Defines how the simulated ATC should respond when aircraft is in this state
 */
export interface AtcGuidance {
  /** Focus area for ATC response generation */
  response_focus: string;
  /** Example ATC phrases for this state */
  examples?: string[];
  /** If true, ATC may initiate communication without pilot request */
  tower_initiate?: boolean;
}

/**
 * FSM State (Phase) - Represents the current status of the aircraft
 * 
 * A state can be:
 * - Static: e.g., "Holding Short" - aircraft is stationary waiting
 * - Process: e.g., "Climbing", "Cruising" - aircraft is in an ongoing activity
 */
export interface FsmState {
  /** Unique identifier for this state/phase */
  id: PhaseName;
  /** Human-readable label for UI display */
  label: string;
  /** Detailed description of what this state represents */
  description: string;
  /** Configuration for ATC behavior in this state */
  atc_guidance: AtcGuidance;
  /** Grouping category (e.g., "Pre-Flight", "Departure", "Arrival") */
  group?: string;
  /** Environment tools to call when entering this state */
  env_tools?: string[];
}

/**
 * FSM Transition Template - Represents an action that moves between states
 * 
 * A transition is an edge in the state graph representing a pilot action
 * that changes the aircraft from one state to another.
 * 
 * Example: HOLD_SHORT__CLIMBING represents the "Take Off" action
 * - from: HOLD_SHORT (aircraft holding at runway)
 * - to: CLIMBING (aircraft is now airborne and climbing)
 * - user_label: "Take Off" (what pilot selects after requirements are met)
 * - requirements: clearance received, acknowledged, etc.
 */
export interface FsmTransitionTemplate {
  /** Unique identifier, typically FROM__TO format */
  id: string;
  /** Source state(s) - can be single or multiple for wildcard transitions like ANY__EMERGENCY */
  from: PhaseName | PhaseName[];
  /** Target state after transition completes */
  to: PhaseName;
  /** 
   * User-visible action label shown in UI
   * This is the action pilot selects AFTER requirements are met
   * e.g., "Take Off", "Land", "Enter Emergency"
   */
  user_label: string;
  /** 
   * Detailed description of this transition action
   * Should describe what the pilot does, prefixed with "Action:"
   */
  description: string;
  /** 
   * List of requirements that must be satisfied before this transition can occur
   * These are communication/procedural requirements (e.g., clearance received, readback given)
   */
  requirements?: string[];
}

/**
 * Flight mode configuration - defines a specific training scenario
 */
export interface FlightModeConfig {
  /** Human-readable label for the flight mode */
  label: string;
  /** Description of this flight mode's purpose and training objectives */
  description: string;
  /** Initial state when this flight mode starts */
  start_state: PhaseName;
  /** Initial aircraft location description */
  initial_location: string;
  /** If true, initial_location should be dynamically set from runway info (e.g., "Holding short runway [XX]") */
  initial_location_from_runway?: boolean;
  /** Transponder squawk code - "random" generates a random code at runtime */
  initial_squawk: string;
  /** States that mark completion of this flight mode */
  terminal_states: PhaseName[];
  /** List of transition IDs allowed in this flight mode */
  allowed_transition_ids: string[];
}

interface FsmYaml {
  id: string;
  version: string;
  description: string;
  states: Array<Omit<FsmState, 'id'> & { id: string; requirements?: string[]; advance?: unknown; env_tools?: string[] }>;
  transition_templates?: Array<Omit<FsmTransitionTemplate, 'from' | 'to'> & { from: string | string[]; to: string; user_label?: string }>;
  flight_modes: Record<string, { 
    label?: string;
    description?: string;
    start_state: string; 
    initial_location?: string;
    initial_location_from_runway?: boolean;
    initial_squawk?: string;
    terminal_states: string[]; 
    allowed_transition_ids: string[];
  }>;
}

/**
 * Generate a random squawk code (4 octal digits, excluding special codes)
 */
function generateRandomSquawk(): string {
  const SPECIAL_SQUAWK_CODES = ['1200', '7500', '7600', '7700'];
  let squawk = '0000';
  
  do {
    const digit1 = Math.floor(Math.random() * 8);
    const digit2 = Math.floor(Math.random() * 8);
    const digit3 = Math.floor(Math.random() * 8);
    const digit4 = Math.floor(Math.random() * 8);
    squawk = `${digit1}${digit2}${digit3}${digit4}`;
  } while (SPECIAL_SQUAWK_CODES.includes(squawk));
  
  return squawk;
}

/**
 * Type guard to check if a string is a valid PhaseName
 */
export function isValidPhaseName(value: string): value is PhaseName {
  return Object.values(PhaseName).includes(value as PhaseName);
}

/**
 * Convert a string to PhaseName, throwing if invalid
 */
export function toPhaseName(value: string): PhaseName {
  if (!isValidPhaseName(value)) {
    throw new Error(`Invalid PhaseName: ${value}`);
  }
  return value;
}

// Backward compatibility aliases
export const isValidStateId = isValidPhaseName;
export const toStateId = toPhaseName;

// ============================================================================
// FsmData Class - Raw data holder (no business logic)
// ============================================================================

class FsmData {
  readonly id: string;
  readonly version: string;
  readonly description: string;
  readonly states: Record<PhaseName, FsmState>;
  readonly transitions: Record<string, FsmTransitionTemplate>;
  readonly flightModes: Record<FlightModeId, FlightModeConfig>;

  constructor(yamlData: FsmYaml) {
    this.id = yamlData.id;
    this.version = yamlData.version;
    this.description = yamlData.description;

    // Build state map (strip legacy fields)
    this.states = {} as Record<PhaseName, FsmState>;
    yamlData.states.forEach((state) => {
      const phaseName = toPhaseName(state.id);
      this.states[phaseName] = {
        id: phaseName,
        label: state.label,
        description: state.description,
        atc_guidance: state.atc_guidance,
        group: state.group,
        env_tools: state.env_tools,
      };
    });

    // Convert flight modes with proper types
    this.flightModes = {} as Record<FlightModeId, FlightModeConfig>;
    for (const [modeKey, modeConfig] of Object.entries(yamlData.flight_modes)) {
      const modeId = modeKey as FlightModeId;
      this.flightModes[modeId] = {
        label: modeConfig.label || modeKey,
        description: modeConfig.description || '',
        start_state: toPhaseName(modeConfig.start_state),
        initial_location: modeConfig.initial_location || 'At parking',
        initial_location_from_runway: modeConfig.initial_location_from_runway ?? false,
        initial_squawk: modeConfig.initial_squawk || 'random',
        terminal_states: modeConfig.terminal_states.map(toPhaseName),
        allowed_transition_ids: modeConfig.allowed_transition_ids,
      };
    }

    // Store transitions by id and validate state references
    this.transitions = {};
    (yamlData.transition_templates || []).forEach((t) => {
      // Validate 'from' states exist
      const fromStatesRaw = Array.isArray(t.from) ? t.from : [t.from];
      const fromStates = fromStatesRaw.map(toPhaseName);
      for (const fromState of fromStates) {
        if (!this.states[fromState]) {
          throw new Error(`Transition "${t.id}" references unknown 'from' state: ${fromState}`);
        }
      }

      // Validate 'to' state exists
      const toPhase = toPhaseName(t.to);
      if (!this.states[toPhase]) {
        throw new Error(`Transition "${t.id}" references unknown 'to' state: ${toPhase}`);
      }

      this.transitions[t.id] = {
        id: t.id,
        from: fromStates.length === 1 ? fromStates[0] : fromStates,
        to: toPhase,
        user_label: t.user_label || t.description, // Fallback to description if no user_label
        description: t.description,
        requirements: t.requirements,
      };
    });
  }
}

// ============================================================================
// FsmGraph Class - Graph for a specific flight mode
// ============================================================================

export class FsmGraph {
  readonly modeId: FlightModeId;
  readonly startState: PhaseName;
  readonly initialLocation: string;
  private readonly initialSquawkConfig: string; // "random" or a specific code
  readonly terminalStates: readonly PhaseName[];
  readonly phaseNames: readonly PhaseName[];

  private readonly data: FsmData;
  private readonly expandedTransitions: FsmTransitionTemplate[];
  private readonly transitionById: Map<string, FsmTransitionTemplate>;
  private readonly outboundByState: Map<PhaseName, FsmTransitionTemplate[]>;
  private readonly inboundByState: Map<PhaseName, FsmTransitionTemplate[]>;

  constructor(data: FsmData, modeId: FlightModeId) {
    this.data = data;
    this.modeId = modeId;

    const config = data.flightModes[modeId];
    if (!config) {
      throw new Error(`Flight mode ${modeId} not found in FSM`);
    }

    this.startState = config.start_state;
    this.initialLocation = config.initial_location;
    this.initialSquawkConfig = config.initial_squawk;
    this.terminalStates = config.terminal_states;

    // Initialize collections
    this.expandedTransitions = [];
    this.transitionById = new Map();
    this.outboundByState = new Map();
    this.inboundByState = new Map();

    // First pass: Build temporary outbound edges for reachability computation
    const tempOutbound = new Map<PhaseName, PhaseName[]>();
    const allExpandedTransitions: FsmTransitionTemplate[] = [];

    for (const transitionId of config.allowed_transition_ids) {
      const template = data.transitions[transitionId];
      if (!template) {
        throw new Error(`Transition ${transitionId} not found in FSM`);
      }

      // Expand multi-from transitions into individual edges
      const fromStates: PhaseName[] = Array.isArray(template.from) ? template.from : [template.from];

      for (const fromState of fromStates) {
        const expandedId = fromStates.length > 1 ? `${fromState}__${template.to}` : template.id;

        const expanded: FsmTransitionTemplate = {
          ...template,
          id: expandedId,
          from: fromState,
        };

        allExpandedTransitions.push(expanded);

        // Build outbound edges for reachability check
        if (!tempOutbound.has(fromState)) {
          tempOutbound.set(fromState, []);
        }
        tempOutbound.get(fromState)!.push(template.to);
      }
    }

    // Compute reachable states from start_state using BFS
    const reachable = new Set<PhaseName>();
    const queue: PhaseName[] = [this.startState];
    reachable.add(this.startState);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = tempOutbound.get(current) || [];
      for (const neighbor of neighbors) {
        if (!reachable.has(neighbor)) {
          reachable.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    // Second pass: Only add transitions where from-state is reachable
    for (const expanded of allExpandedTransitions) {
      const fromState = expanded.from as PhaseName;

      // Skip transitions from unreachable states
      if (!reachable.has(fromState)) {
        continue;
      }

      this.expandedTransitions.push(expanded);
      this.transitionById.set(expanded.id, expanded);

      // Index by from-state
      if (!this.outboundByState.has(fromState)) {
        this.outboundByState.set(fromState, []);
      }
      this.outboundByState.get(fromState)!.push(expanded);

      // Index by to-state
      if (!this.inboundByState.has(expanded.to)) {
        this.inboundByState.set(expanded.to, []);
      }
      this.inboundByState.get(expanded.to)!.push(expanded);
    }

    this.phaseNames = Array.from(reachable);
  }

  // ---------------------------------------------------------------------------
  // State Methods
  // ---------------------------------------------------------------------------

  getState(phaseName: PhaseName): FsmState {
    const state = this.data.states[phaseName];
    if (!state) {
      throw new Error(`State ${phaseName} not found in FSM`);
    }
    return state;
  }

  getAllPhaseNames(): PhaseName[] {
    return [...this.phaseNames];
  }

  isTerminalState(phaseName: PhaseName): boolean {
    return this.terminalStates.includes(phaseName);
  }

  /**
   * Get initial squawk code for this flight mode
   * Returns a specific code or generates a random one if configured as "random"
   */
  getInitialSquawk(): string {
    if (this.initialSquawkConfig === 'random') {
      return generateRandomSquawk();
    }
    return this.initialSquawkConfig;
  }

  /**
   * Get flight mode configuration including label and description
   */
  getFlightModeConfig(): FlightModeConfig {
    return this.data.flightModes[this.modeId];
  }

  // ---------------------------------------------------------------------------
  // Transition Methods
  // ---------------------------------------------------------------------------

  getTransition(transitionId: TransitionId): FsmTransitionTemplate {
    const transition = this.transitionById.get(transitionId);
    if (!transition) {
      throw new Error(`Transition ${transitionId} not found in flight mode ${this.modeId}`);
    }
    return transition;
  }

  listTransitionsFrom(phaseName: PhaseName): FsmTransitionTemplate[] {
    return this.outboundByState.get(phaseName) || [];
  }

  listTransitionsTo(phaseName: PhaseName): FsmTransitionTemplate[] {
    return this.inboundByState.get(phaseName) || [];
  }

  getAllTransitions(): FsmTransitionTemplate[] {
    return [...this.expandedTransitions];
  }
}

// ============================================================================
// Singleton Loader
// ============================================================================

function loadFsmData(): FsmData {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const yamlPath = path.join(__dirname, 'fsm.yaml');
  const yamlContent = fs.readFileSync(yamlPath, 'utf8');
  const parsed = yaml.load(yamlContent) as FsmYaml;
  return new FsmData(parsed);
}

export const fsmData = loadFsmData();

// Cache for FsmGraph instances
const fsmGraphCache = new Map<FlightModeId, FsmGraph>();

/**
 * Get FsmGraph for a specific flight mode
 * Graphs are cached for efficiency
 */
export function getFsmGraph(modeId: FlightModeId): FsmGraph {
  let graph = fsmGraphCache.get(modeId);
  if (!graph) {
    graph = new FsmGraph(fsmData, modeId);
    fsmGraphCache.set(modeId, graph);
  }
  return graph;
}

/**
 * Convert training mode string to FlightModeId
 * Returns VFR as default if no match
 */
export function trainingModeToFlightModeId(trainingMode: string | null | undefined): FlightModeId {
  switch (trainingMode) {
    case 'approach':
      return FlightModeId.APPROACH;
    case 'emergency':
      return FlightModeId.EMERGENCY;
    case 'traffic-pattern':
      return FlightModeId.TRAFFIC_PATTERN;
    case 'vfr':
      return FlightModeId.VFR;
    default:
      return FlightModeId.VFR;
  }
}

