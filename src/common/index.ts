/**
 * ATC Common - FSM data access library and shared schemas
 */

// Export schemas
export * from './schemas.js';

// Export FSM graph class, data, enums, and helpers
export {
  FsmGraph,
  fsmData,
  getFsmGraph,
  trainingModeToFlightModeId,
  PhaseName,
  FlightModeId,
  isValidPhaseName,
  toPhaseName,
  // Backward compatibility aliases
  isValidStateId,
  toStateId,
} from './fsm-data.js';

// Export types (StateId is now an alias for PhaseName)
export type {
  AtcGuidance,
  FsmState,
  FsmTransitionTemplate,
  TransitionId,
  StateId,
} from './fsm-data.js';
