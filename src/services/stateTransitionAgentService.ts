import { z } from 'zod';
import { zodTextFormat } from 'openai/helpers/zod';
import type { FastifyBaseLogger } from 'fastify';
import { OpenAIService } from './openAIService.js';
import { env } from '../config/env.js';
import {
  getFsmGraph,
  FlightModeId,
  type FsmGraph,
  type PhaseName,
  type FsmTransitionTemplate,
  StateId,
} from '../common/index.js';

// Default VFR graph for backward compatibility
const defaultFsmGraph = getFsmGraph(FlightModeId.VFR);
import { loadPrompt } from '../utils/promptUtils.js';

const STATE_TRANSITION_AGENT_PROMPT = loadPrompt('state-transition-agent-prompt.txt');

// Response schema for State Transition Agent
const TransitionEvalSchema = z.object({
  id: z.string(),
  active: z.boolean(),
  results: z.array(
    z.object({
      met: z.boolean(),
      reason: z.string(),
    })
  ),
  approved: z.boolean(),
  audio: z.string(),
});

const StateTransitionAgentLLMResponseSchema = z.object({
  transitions: z.array(TransitionEvalSchema),
  selected: z.string(),
});

type TransitionRequirementResult = z.infer<typeof TransitionEvalSchema>['results'][number];

export type StateTransitionAgentLLMResponse = z.infer<typeof StateTransitionAgentLLMResponseSchema>;

interface CandidateTransitionDetail {
  transition: FsmTransitionTemplate;
  to_state: StateId;
  requirements: Array<{ requirement_index: number; summary: string }>;
}

import type { BaseAgentContext } from '../utils/agentContextHelper.js';

interface StateTransitionAgentContext extends BaseAgentContext {
  available_transitions: Array<{
    transition_id: string;
    to_state: StateId;
    to_state_label: string;
    to_state_description: string;
    requirements: Array<{ requirement_index: number; summary: string }>;
  }>;
}

export interface TransitionDetail {
  transition_id: string;
  to_phase: string;
  user_label: string;
  description: string;
  active: boolean;
  approved: boolean;
  requirements_checklist: {
    requirement_text: string;
    met: boolean;
    reason: string;
  }[];
  suggested_audio: string;
}

export interface StateTransitionAgentResponse {
  /** All transitions with their details */
  transitions: TransitionDetail[];
  /** ID of the active transition (if any) */
  active_transition_id: string | null;
  /** Whether pilot can advance (at least one transition is approved) */
  should_advance: boolean;
}

import { buildAgentContext } from '../utils/agentContextHelper.js';

export class StateTransitionAgentService {
  /**
   * Evaluate if pilot can advance to next phase based on full session history
   * @param sessionHistory - Array of session history strings (from SessionHistoryService.getSessionHistory)
   * @param currentPhase - Current phase name
   * @param airportIcao - Airport ICAO code
   * @param aircraftTailNumber - Aircraft tail number
   * @param logger - Fastify logger
   * @param fsmGraph - FsmGraph to use (defaults to VFR graph for backward compatibility)
   */
  static async evaluateStateTransition(
    sessionHistory: string[],
    currentPhase: PhaseName,
    airportIcao: string,
    aircraftTailNumber: string,
    logger: FastifyBaseLogger,
    fsmGraph: FsmGraph = defaultFsmGraph
  ): Promise<StateTransitionAgentResponse> {
    logger.info({ currentPhase, historyLength: sessionHistory.length }, '[StateTransitionAgentService] Evaluating state transition...');
    
    // Get FSM state info
    const availableTransitions = fsmGraph.listTransitionsFrom(currentPhase);
    
    // Build context for LLM
    if (availableTransitions.length === 0) {
      logger.info(
        { currentPhase },
        '[StateTransitionAgentService] No available transitions for current state'
      );
      return {
        transitions: [],
        active_transition_id: null,
        should_advance: false,
      };
    }

    const candidateTransitionDetails = new Map<string, CandidateTransitionDetail>();

    const requestContext: StateTransitionAgentContext = {
      ...(await buildAgentContext(
        fsmGraph,
        currentPhase,
        airportIcao,
        aircraftTailNumber,
        sessionHistory,
        undefined,
        logger
      )),
      available_transitions: availableTransitions.map((transition) => {
        const toState = fsmGraph.getState(transition.to);
        const requirements = (transition.requirements || []).map((summary, idx) => ({
          requirement_index: idx,
          summary,
        }));
        candidateTransitionDetails.set(transition.id, {
          transition,
          to_state: transition.to,
          requirements,
        });
        return {
          transition_id: transition.id,
          to_state: transition.to,
          to_state_label: toState.label,
          to_state_description: toState.description ?? '',
          requirements,
        };
      }),
    };
    
    const openaiService = new OpenAIService(env.OPENAI_API_KEY);
    
    const response = await openaiService.chatWithAI<StateTransitionAgentLLMResponse>(
      JSON.stringify(requestContext),
      STATE_TRANSITION_AGENT_PROMPT,
      zodTextFormat(StateTransitionAgentLLMResponseSchema, "state_transition"),
      {
        model: 'gpt-5.1',
        max_tokens: 1000,
        temperature: 0.2,
      },
      logger
    );
    
    // Log removed - combined in EvaluationController for better context
    
    const transitionEvaluations = response.data.transitions;

    // Helper to attach requirement text to results
    const attachRequirementText = (
      transitionId: string,
      results: TransitionRequirementResult[]
    ) => {
      const detail = candidateTransitionDetails.get(transitionId);
      const requirements = detail?.requirements ?? [];
      return results.map((result, idx) => ({
        requirement_text: requirements[idx]?.summary ?? `Requirement ${idx}`,
        met: result.met,
        reason: result.reason,
      }));
    };

    // Build transition details for response
    const transitions: TransitionDetail[] = transitionEvaluations.map((eval_) => {
      const detail = candidateTransitionDetails.get(eval_.id);
      return {
        transition_id: eval_.id,
        to_phase: detail?.to_state ?? '',
        user_label: detail?.transition.user_label ?? eval_.id,
        description: detail?.transition.description ?? '',
        active: eval_.active,
        approved: eval_.approved,
        requirements_checklist: attachRequirementText(eval_.id, eval_.results),
        suggested_audio: eval_.audio,
      };
    });

    // Find the active transition ID
    const activeTransition = transitions.find(t => t.active);
    const activeTransitionId = activeTransition?.transition_id ?? null;

    // Determine if any transition is approved
    const shouldAdvance = transitions.some(t => t.approved);

    return {
      transitions,
      active_transition_id: activeTransitionId,
      should_advance: shouldAdvance,
    };
  }
}
