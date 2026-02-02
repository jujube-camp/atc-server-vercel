import { FastifyRequest, FastifyReply } from 'fastify';
import { StateTransitionAgentService, TransitionDetail } from '../services/stateTransitionAgentService.js';
import { SessionHistoryService } from '../services/sessionHistoryService.js';
import { prisma } from '../utils/prisma.js';
import { getFsmGraph, trainingModeToFlightModeId, type PhaseName } from '../common/index.js';
import { getEffectiveAirportIcao } from '../utils/agentContextHelper.js';

/**
 * Controller for evaluation and assessment operations
 */
export class EvaluationController {
  /**
   * Evaluate requirements - check if pilot can advance to next phase
   */
  static async evaluateRequirements(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const userId = (request.user as any).userId;
    const { sessionId, currentPhase } = request.body as {
      sessionId: string;
      currentPhase: PhaseName;
    };

    request.server.log.info(
      { sessionId, currentPhase },
      '[EvaluationController] Evaluating requirements'
    );

    // Get and validate session
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      return reply.code(404).send({
        message: 'Session not found',
      });
    }

    // Use activeAirportIcao if set, otherwise fallback to airportIcao
    const currentAirportIcao = getEffectiveAirportIcao(
      session.airportIcao,
      (session as any).activeAirportIcao
    );

    // Get FsmGraph based on session's training mode
    const flightModeId = trainingModeToFlightModeId(session.trainingMode);
    const fsmGraph = getFsmGraph(flightModeId);

    // Check if all transitions from current state have no requirements
    const availableTransitions = fsmGraph.listTransitionsFrom(currentPhase);
    const allTransitionsHaveNoRequirements = availableTransitions.length > 0 && 
      availableTransitions.every(transition => !('requirements' in transition));
    let result: Awaited<ReturnType<typeof StateTransitionAgentService.evaluateStateTransition>>;

    if (allTransitionsHaveNoRequirements) {
      // Skip LLM call - no requirements to evaluate, allow advancement
      request.server.log.info(
        { currentPhase, transitionCount: availableTransitions.length },
        '[EvaluationController] All transitions have no requirements, skipping LLM evaluation'
      );
      
      // All transitions are approved - build transition details
      const transitions: TransitionDetail[] = availableTransitions.map(t => ({
        transition_id: t.id,
        to_phase: t.to,
        user_label: t.user_label,
        description: t.description,
        active: false, // No ATC instruction yet
        approved: true, // No requirements means auto-approved
        requirements_checklist: [],
        suggested_audio: '', // No suggestion when no requirements
      }));
      
      result = {
        transitions,
        active_transition_id: null,
        should_advance: true,
      };
    } else {
      // Get session history
      const sessionHistory = await SessionHistoryService.getSessionHistory(sessionId, 20, true) as string[];

      // Evaluate state transition using State Transition Agent
      result = await StateTransitionAgentService.evaluateStateTransition(
        sessionHistory,
        currentPhase,
        currentAirportIcao,
        session.aircraftTailNumber,
        request.server.log,
        fsmGraph
      );
    }

    // Combined log with state transition evaluation details
    request.server.log.info(
      { 
        should_advance: result.should_advance, 
        active_transition_id: result.active_transition_id,
        transitions_count: result.transitions.length,
        approved_count: result.transitions.filter(t => t.approved).length,
        transition_evaluations: result.transitions.map(t => ({
          id: t.transition_id,
          active: t.active,
          approved: t.approved,
          results_total: t.requirements_checklist.length,
          results_met: t.requirements_checklist.filter(r => r.met).length,
        })),
      },
      '[EvaluationController] State transition requirements evaluated'
    );

    return reply.send({
      transitions: result.transitions,
      active_transition_id: result.active_transition_id,
      should_advance: result.should_advance,
    });
  }
}
