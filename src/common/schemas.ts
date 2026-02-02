/**
 * Shared schemas for ATC training system
 */

import { z } from 'zod';
import { PhaseName } from './fsm-data.js';

// Re-export PhaseName from fsm-data for convenience
export { PhaseName } from './fsm-data.js';

// Create a Zod schema for phase names using the PhaseName enum values
export const PhaseNameSchema = z.enum(Object.values(PhaseName) as [PhaseName, ...PhaseName[]]);

// ============================================================================
// REQUIREMENT CHECKLIST SCHEMA (defined early for use in session schema)
// ============================================================================

/**
 * Requirement checklist item schema
 */
export const requirementChecklistItemSchema = z.object({
  requirement_text: z.string(),
  met: z.boolean(),
  reason: z.string(),
});

export type RequirementChecklistItem = z.infer<typeof requirementChecklistItemSchema>;

// ============================================================================
// TRANSITION DETAIL SCHEMA (defined early for use in evaluation schemas)
// ============================================================================

/**
 * Transition detail schema - full details for each transition
 */
export const transitionDetailSchema = z.object({
  transition_id: z.string(),
  to_phase: PhaseNameSchema,
  user_label: z.string(),
  description: z.string(),
  active: z.boolean(),
  approved: z.boolean(),
  requirements_checklist: z.array(requirementChecklistItemSchema),
  suggested_audio: z.string(),
});

export type TransitionDetail = z.infer<typeof transitionDetailSchema>;

// ============================================================================
// SESSION SCHEMAS
// ============================================================================

/**
 * Training mode schema
 * Includes every training template exposed in the trainer UI.
 */
export const trainingModeSchema = z.string();
export type TrainingMode = string;

export const trainingModeConfigSchema = z.object({
  trainingMode: trainingModeSchema,
  label: z.string(),
  description: z.string().nullable().optional(),
  showDepartureAirport: z.boolean(),
  showArrivalAirport: z.boolean(),
  showAircraftType: z.boolean(),
  showTailNumber: z.boolean(),
  imageUrl: z.string().url(),
  displayOrder: z.number().int(),
  initRadioType: z.string().nullable().optional(),
  isFree: z.boolean().optional(),
});

export type TrainingModeConfig = z.infer<typeof trainingModeConfigSchema>;

export const aircraftTypeSchema = z.object({
  id: z.string(),
  value: z.string(),
  label: z.string(),
  category: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  displayOrder: z.number().int(),
  isActive: z.boolean(),
});

export type AircraftTypeOption = z.infer<typeof aircraftTypeSchema>;

/**
 * Create session request schema
 */
export const createSessionSchema = z.object({
  airportIcao: z.string().min(3).max(4).toUpperCase(),
  arrivalAirport: z.string().min(3).max(4).toUpperCase().optional(),
  aircraftTailNumber: z.string().min(1).max(10),
  aircraftType: z.string().min(1).max(50).optional(),
  trainingMode: trainingModeSchema.optional(),
  radioFrequency1: z.string().optional(),
  currentLocation: z.string().optional(),
  squawk: z.string().optional(),
});

export type CreateSessionRequest = z.infer<typeof createSessionSchema>;

/**
 * Session response schema
 */
export const sessionResponseSchema = z.object({
  id: z.string(),
  userId: z.string().nullable(),
  airportIcao: z.string(),
  arrivalAirport: z.string().nullable().optional(),
  aircraftTailNumber: z.string(),
  aircraftType: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
  currentLocation: z.string().nullable().optional(),
  trainingMode: trainingModeSchema.nullable().optional(),
  radioFrequency1: z.string().nullable().optional(),
  squawk: z.string().nullable().optional(),
  activeAirportIcao: z.string().nullable().optional(),
  
  initial_phase_info: z.object({
    name: PhaseNameSchema,
    requirementsChecklist: z.array(requirementChecklistItemSchema),
  }),
});

export type SessionResponse = z.infer<typeof sessionResponseSchema>;

/**
 * Session location response schema - lightweight location fetch
 */
export const sessionLocationResponseSchema = z.object({
  currentLocation: z.string().nullable(),
});

export type SessionLocationResponse = z.infer<typeof sessionLocationResponseSchema>;

/**
 * Session list item schema - for listing sessions without initial_phase_info
 */
export const sessionListItemSchema = sessionResponseSchema.omit({
  initial_phase_info: true,
});

export type SessionListItem = z.infer<typeof sessionListItemSchema>;

// ============================================================================
// COMMUNICATION SCHEMAS
// ============================================================================

/**
 * Transmission request schema - for sending audio/voice communication
 */
export const transmissionRequestSchema = z.object({
  sessionId: z.string().min(1, 'Invalid session ID'),
  currentPhase: PhaseNameSchema,
  audioData: z.string(), // Base64-encoded audio data
  audioMimeType: z.string().regex(/^audio\//, 'Invalid audio MIME type'),
  messageContent: z.string().trim().min(1).max(500).optional(),
  radioFrequency1: z.string().optional(), // User-selected radio frequency
});

export type TransmissionRequest = z.infer<typeof transmissionRequestSchema>;

/**
 * ATC response schema - response from ATC system
 */
export const atcResponseSchema = z.object({
  message: z.string(),
  audioUrl: z.string().optional(),
  audioData: z.string().optional(), // Base64-encoded audio data
  audioMimeType: z.string().optional(),
  transmissionId: z.string().optional(), // For linking TTS audio to transmission event
});

export type AtcResponse = z.infer<typeof atcResponseSchema>;

/**
 * Evaluation schema - contains feedback, score, and example answer
 */
export const evaluationSchema = z.object({
  score: z.number().min(0).max(5),
  feedback: z.string(),
  exampleAnswer: z.string().optional(),
});

export type Evaluation = z.infer<typeof evaluationSchema>;

/**
 * Environment response schema - for environment agent decisions
 */
export const envResponseSchema = z.object({
  shouldAdvance: z.boolean().default(false),
  nextPhase: PhaseNameSchema.optional(),
  requirementsChecklist: z.array(z.object({
    requirementText: z.string(),
    met: z.boolean(),
    reason: z.string(),
  })).optional()
});

export type EnvResponse = z.infer<typeof envResponseSchema>;

/**
 * Transmission response schema (simplified - no evaluation, no envResponse)
 */
export const transmissionResponseSchema = z.object({
  success: z.boolean(),
  transcription: z.string().optional(),
  atcResponse: atcResponseSchema.optional(),
});

export type TransmissionResponse = z.infer<typeof transmissionResponseSchema>;

// ============================================================================
// PHASE ADVANCE SCHEMAS
// ============================================================================

/**
 * Phase advance request schema
 */
export const phaseAdvanceRequestSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  currentPhase: PhaseNameSchema,
  nextPhase: PhaseNameSchema,
});

export type PhaseAdvanceRequest = z.infer<typeof phaseAdvanceRequestSchema>;

/**
 * Phase advance response schema (simplified - no envResponse)
 */
export const phaseAdvanceResponseSchema = z.object({
  success: z.boolean(),
  newPhase: PhaseNameSchema.nullable(),
  atcMessage: atcResponseSchema.optional(),
  isComplete: z.boolean().default(false),
  /** New active airport ICAO - returned when VFR flight switches from departure to arrival airport */
  activeAirport: z.string().optional(),
});

export type PhaseAdvanceResponse = z.infer<typeof phaseAdvanceResponseSchema>;

// ============================================================================
// EVALUATION SCHEMAS
// ============================================================================

/**
 * Evaluation requirements request schema
 */
export const evaluationRequirementsRequestSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  currentPhase: PhaseNameSchema,
});

export type EvaluationRequirementsRequest = z.infer<typeof evaluationRequirementsRequestSchema>;

/**
 * Evaluation requirements response schema
 */
export const evaluationRequirementsResponseSchema = z.object({
  /** All transitions with their details */
  transitions: z.array(transitionDetailSchema),
  /** ID of the active transition (if any) */
  active_transition_id: z.string().nullable(),
  /** Whether pilot can advance (at least one transition is approved) */
  should_advance: z.boolean(),
});

export type EvaluationRequirementsResponse = z.infer<typeof evaluationRequirementsResponseSchema>;

// ============================================================================
// UTILITY SCHEMAS
// ============================================================================

/**
 * Session params schema
 */
export const sessionParamsSchema = z.object({
  sessionId: z.string(),
});

export type SessionParams = z.infer<typeof sessionParamsSchema>;

/**
 * Error response schema
 */
export const errorResponseSchema = z.object({
  message: z.string(),
  details: z.string().optional(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

// ============================================================================
// AIRPORT SCHEMAS
// ============================================================================

/**
 * Airport request schema - for requesting airport data by ICAO code
 */
export const airportRequestSchema = z.object({
  icao_code: z.string().min(1, 'ICAO code is required'),
});

export type AirportRequest = z.infer<typeof airportRequestSchema>;

/**
 * Airport response schema - contains all airport data fields
 */
export const airportResponseSchema = z.object({
  id: z.string(),
  ident: z.string(),
  type: z.string(),
  name: z.string(),
  latitude_deg: z.number().nullable().optional(),
  longitude_deg: z.number().nullable().optional(),
  elevation_ft: z.string().nullable().optional(),
  continent: z.string(),
  iso_country: z.string(),
  iso_region: z.string(),
  municipality: z.string().nullable().optional(),
  scheduled_service: z.string().nullable().optional(),
  icao_code: z.string().nullable().optional(),
  iata_code: z.string().nullable().optional(),
  gps_code: z.string().nullable().optional(),
  local_code: z.string().nullable().optional(),
  json_data: z.string().nullable().optional()
});

export type AirportResponse = z.infer<typeof airportResponseSchema>;
