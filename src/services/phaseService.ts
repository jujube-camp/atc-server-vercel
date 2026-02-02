import { prisma } from '../utils/prisma.js';
import type { Prisma } from '@prisma/client';
import {
  getFsmGraph,
  trainingModeToFlightModeId,
  toStateId,
  PhaseAdvanceResponse,
  AtcResponse,
  PhaseName,
} from '../common/index.js';
import { SessionHistoryService } from './sessionHistoryService.js';
import type { FastifyBaseLogger } from 'fastify';
import { AtcAgentService } from './atcAgentService.js';
import { LocationService } from './locationService.js';
import { StatefulEnvAgent } from './envAgent.js';

import { buildAgentContext, getAirportInfoForAgent, getEffectiveAirportIcao } from '../utils/agentContextHelper.js';

export class PhaseService {

  /**
   * Advance to the next phase in a session using AI evaluation
   * Supports DUMMY_START as currentPhase for initial session advancement
   */
  static async advancePhase(
    sessionId: string, 
    userId: string, 
    currentPhase: string, 
    targetNextPhase: string,
    logger: FastifyBaseLogger
  ): Promise<PhaseAdvanceResponse> {
    logger.info(`[PhaseService] Advancing phase from ${currentPhase} to ${targetNextPhase}`);

    // Get and validate session
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        userId,
      },
    });

    if (!session) {
      throw new Error('Session not found');
    }

    // Get FsmGraph based on session's training mode
    const flightModeId = trainingModeToFlightModeId(session.trainingMode);
    const fsmGraph = getFsmGraph(flightModeId);

    // Validate target phase
    const targetNextPhaseId = toStateId(targetNextPhase);
    const allPhaseNames = fsmGraph.getAllPhaseNames();
    
    if (!allPhaseNames.includes(targetNextPhaseId)) {
      throw new Error(`Invalid next phase: ${targetNextPhase}`);
    }

    // Handle DUMMY_START specially - this is the initial phase advance after session creation
    const isInitialAdvance = currentPhase === PhaseName.DUMMY_START;
    
    if (isInitialAdvance) {
      // For initial advance, verify target is the start state for this flight mode
      if (targetNextPhaseId !== fsmGraph.startState) {
        throw new Error(`Initial phase must be ${fsmGraph.startState}, got ${targetNextPhase}`);
      }
      logger.info(`[PhaseService] Initial phase advance to ${targetNextPhase}`);
    } else {
      // Normal phase advance - validate transition exists
      const currentPhaseId = toStateId(currentPhase);
      const outboundTransitions = fsmGraph.listTransitionsFrom(currentPhaseId);
      const allowedTransition = outboundTransitions.find((transition) => transition.to === targetNextPhaseId);

      if (!allowedTransition) {
        throw new Error(`Transition from ${currentPhase} to ${targetNextPhase} is not allowed`);
      }
    }

    // Detect if this phase change will trigger an active airport switch (VFR flights)
    // For VFR flights reaching CRUISING, switch to arrival airport
    const shouldSwitchToArrival = 
      session.trainingMode === 'vfr' &&
      targetNextPhaseId === PhaseName.CRUISING &&
      (session as any).arrivalAirport;
    
    const newActiveAirport = shouldSwitchToArrival ? (session as any).arrivalAirport : undefined;
    
    if (shouldSwitchToArrival) {
      logger.info(
        { sessionId, phase: targetNextPhase, trainingMode: session.trainingMode, newActiveAirport },
        '[PhaseService] Active airport switching to arrival airport for VFR CRUISING phase'
      );
    }

    await prisma.session.update({
      where: { id: sessionId },
      data: {
        currentPhaseName: targetNextPhase,
        ...(shouldSwitchToArrival && {
            activeAirportIcao: newActiveAirport,
          }),
      },
    });

    // Create phase advance event for audit logging
    await prisma.phaseAdvanceEvent.create({
      data: {
        sessionId,
        from_phase: currentPhase,
        to_phase: targetNextPhase,
      },
    });

    // Get session history (used for ATC agent context)
    const history = await SessionHistoryService.getSessionHistory(sessionId, 10, true) as string[];

    // Get FSM state and flight mode info
    const state = fsmGraph.getState(targetNextPhaseId);
    const currentPhaseInfo = {
      current_phase: state.id,
      label: state.label,
      description: state.description,
      atc_guidance: state.atc_guidance,
    };
    const envTools = state.env_tools;

    // Check if terminal phase based on the session's FsmGraph
    if (fsmGraph.isTerminalState(targetNextPhaseId)) {
      logger.info(`[PhaseService] Phase ${targetNextPhase} is terminal for flight mode ${flightModeId}`);
      return {
        success: true,
        newPhase: targetNextPhaseId,
        isComplete: true,
        ...(newActiveAirport && { activeAirport: newActiveAirport }),
      };
    }

    // Check if Tower should initiate communication for this phase
    const shouldTowerInitiate = currentPhaseInfo.atc_guidance?.tower_initiate ?? false;
    
    if (!shouldTowerInitiate) {
      logger.info(`[PhaseService] Phase ${targetNextPhase} does not require Tower initiation`);
      return {
        success: true,
        newPhase: targetNextPhaseId,
        isComplete: false,
        ...(newActiveAirport && { activeAirport: newActiveAirport }),
      };
    }

    // Tower initiates - generate ATC message using ATC Agent
    logger.info(`[PhaseService] Generating ATC entry message for ${targetNextPhase}`);

    // Use activeAirportIcao if set, otherwise fallback to airportIcao
    // After the update above, activeAirportIcao may have been set for VFR flights
    const currentAirportIcao = newActiveAirport || getEffectiveAirportIcao(
      session.airportIcao,
      (session as any).activeAirportIcao
    );

    // Get airport information for environment agent
    const { structuredInfo } = await getAirportInfoForAgent(currentAirportIcao, logger);

    // Use latest known location for ATC context
    const currentLocation = await LocationService.getCurrentLocation(sessionId);

    // Create environment agent for runway situation awareness
    const envAgent = new StatefulEnvAgent(sessionId, structuredInfo ?? undefined);

    // Call ATC Agent for phase entry message
    // For phase entry, we explicitly mark this as a phase_entry trigger
    const atcAgentResult = await AtcAgentService.generateAtcResponse(
      {
        ...(await buildAgentContext(
          fsmGraph,
          targetNextPhaseId,
          currentAirportIcao,
          session.aircraftTailNumber,
          history,
          {
            userSelectedFrequencyType: null,
            currentLocation: currentLocation || 'Unknown',
          },
          logger
        )),
        trigger_input: `Phase advanced from ${currentPhase} to ${targetNextPhase}`,
        trigger_type: 'phase_entry',
      },
      logger,
      { envAgent, envTools }
    );

    // Store ATC transmission event (always store metadata and message, even if message is empty)
    // For tower_initiate phases, use "TWR" as the sender
    let atcMessage: AtcResponse | undefined;
    const atcTransmission = await prisma.transmissionEvent.create({
      data: {
        sessionId,
        sender: 'TWR' as any, // TODO: pass user_selected_frequency_type and use it as sender
        current_phase: targetNextPhase,
        audio_transcript: atcAgentResult.message || "",
        audio_url: null, // Will be updated by TTS controller when audio is generated
        metadata: JSON.stringify({
          expected: atcAgentResult.expected,
        }),
      } as Prisma.TransmissionEventUncheckedCreateInput,
    });

    if (atcAgentResult.message && atcAgentResult.message.trim() !== '') {
      atcMessage = {
        message: atcAgentResult.message,
        transmissionId: atcTransmission.id, // Include transmission ID for TTS
      };
    }

    return {
      success: true,
      newPhase: targetNextPhaseId,
      isComplete: false,
      atcMessage,
      ...(newActiveAirport && { activeAirport: newActiveAirport }),
    };
  }
}
