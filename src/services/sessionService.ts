import { prisma } from '../utils/prisma.js';
import type { Prisma } from '@prisma/client';
import { getFsmGraph, trainingModeToFlightModeId, StateId, toStateId } from '../common/index.js';
import type { FsmGraph } from '../common/index.js';
import type { FastifyBaseLogger } from 'fastify';
import { SessionHistoryService } from './sessionHistoryService.js';
import { EnvironmentAgentService } from './environmentAgentService.js';
import { LocationService } from './locationService.js';
import { S3Service } from './s3Service.js';
import { logger as defaultLogger } from '../utils/logger.js';
import type { CreateSessionRequest } from '../common/index.js';
import { MembershipService } from './membershipService.js';
import { AirportService } from './airportService.js';
import { normalizeAirportInfo } from '../utils/airportUtils.js';
import { getAirportInfoForAgent, getEffectiveAirportIcao } from '../utils/agentContextHelper.js';

// Default runway fallback for traffic pattern mode
const DEFAULT_RUNWAY = '12';

/**
 * Extract a runway identifier from airport info
 * Returns the first available runway or the default fallback
 */
function getRunwayFromAirportInfo(airportIcao: string, logger: FastifyBaseLogger): Promise<string> {
  return (async () => {
    try {
      const airportData = await AirportService.getAirportByIcaoCode(airportIcao);
      const structuredInfo = normalizeAirportInfo(airportData);
      
      if (structuredInfo.runways.length > 0) {
        // Pick a random runway endpoint from available runways
        const allRunwayEnds: string[] = [];
        for (const runway of structuredInfo.runways) {
          if (runway.le_ident) allRunwayEnds.push(runway.le_ident);
          if (runway.he_ident) allRunwayEnds.push(runway.he_ident);
        }
        
        if (allRunwayEnds.length > 0) {
          const runway = allRunwayEnds[Math.floor(Math.random() * allRunwayEnds.length)];
          logger.info({ airportIcao, runway }, '[SessionService] Selected runway from airport info');
          return runway;
        }
      }
      
      logger.info({ airportIcao }, '[SessionService] No runways found in airport info, using default');
      return DEFAULT_RUNWAY;
    } catch (error) {
      logger.warn({ error, airportIcao }, '[SessionService] Failed to get airport info for runway selection');
      return DEFAULT_RUNWAY;
    }
  })();
}

export interface CreateSessionData extends CreateSessionRequest {
  userId?: string; // Optional for MVP - will use test user if not provided
}

function buildRequirementChecklist(stateId: StateId, graph: FsmGraph) {
  const transitions = graph.listTransitionsFrom(stateId);
  const seen = new Set<string>();
  return transitions.flatMap((transition) => {
    const items = [];
    for (const requirement of transition.requirements || []) {
      if (seen.has(requirement)) continue;
      seen.add(requirement);
      items.push({
        requirement_text: requirement,
        met: false,
        reason: '',
      });
    }
    return items;
  });
}

export class SessionService {
  /**
   * Create a new session
   * After creation, client should call phaseAdvance(DUMMY_START -> initialPhase) to start
   */
  static async createSession(data: CreateSessionData, logger: FastifyBaseLogger) {
    // userId is required - should come from authenticated request
    if (!data.userId) {
      throw new Error('User ID is required to create a session');
    }

    // Check if training mode is accessible BEFORE recording usage
    // This prevents incorrectly consuming the user's quota if they don't have access
    if (data.trainingMode) {
      const membership = await MembershipService.getMembership(data.userId);
      const canAccessMode = await MembershipService.canAccessTrainingMode(membership, data.trainingMode);
      if (!canAccessMode) {
        throw new Error(`Training mode "${data.trainingMode}" requires a membership. Please upgrade to access this mode.`);
      }
    }

    // Atomically check membership limits and record usage for training session creation
    // This prevents TOCTOU race conditions where concurrent requests could both
    // pass the limit check before either increments the counter
    const usageResult = await MembershipService.tryRecordUsageForTrainingSession(data.userId, logger);
    if (!usageResult.allowed) {
      throw new Error(usageResult.reason || 'Cannot create training session');
    }

    // Get FsmGraph based on training mode to determine start state and initial values
    const flightModeId = trainingModeToFlightModeId(data.trainingMode);
    const graph = getFsmGraph(flightModeId);
    const initialPhaseName = graph.startState;
    let initialLocation = graph.initialLocation;
    const initialSquawk = graph.getInitialSquawk();

    // If flight mode is configured to use runway for initial location, dynamically set it
    const flightModeConfig = graph.getFlightModeConfig();
    if (flightModeConfig.initial_location_from_runway) {
      const runway = await getRunwayFromAirportInfo(data.airportIcao, logger);
      initialLocation = `Holding short runway ${runway}`;
    }

    logger.info({ 
      userId: data.userId, 
      trainingMode: data.trainingMode, 
      flightModeId, 
      initialPhaseName,
      initialLocation,
      initialSquawk,
    }, 'Creating session for user');
    
    const session = await prisma.session.create({
      data: {
        user: {
          connect: { id: data.userId },
        },
        airportIcao: data.airportIcao,
        arrivalAirport: data.arrivalAirport ?? null,
        aircraftTailNumber: data.aircraftTailNumber,
        aircraftType: data.aircraftType ?? null,
        currentPhaseName: initialPhaseName,
        currentLocation: data.currentLocation ?? initialLocation,
        trainingMode: data.trainingMode ?? null,
        radioFrequency1: data.radioFrequency1 ?? null,
        squawk: data.squawk ?? initialSquawk,
      } as Prisma.SessionCreateInput,
    });

    // Usage has already been recorded atomically in tryRecordUsageForTrainingSession above

    // Build requirements checklist for initial phase
    // Note: Client should call phaseAdvance(DUMMY_START -> initialPhase) after session creation
    const requirementsChecklist = buildRequirementChecklist(initialPhaseName, graph);

    return {
      ...session,
      initial_phase_info: {
        name: initialPhaseName,
        requirementsChecklist,
      },
    };
  }

  /**
   * Get sessions for a user (latest 20, ordered by most recently updated)
   */
  static async getUserSessions(userId: string) {
    return await prisma.session.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });
  }

  /**
   * Get a session by ID (must belong to the user)
   */
  static async getSession(userId: string, sessionId: string) {
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new Error('Session not found');
    }

    // Get FsmGraph based on session's training mode
    const flightModeId = trainingModeToFlightModeId(session.trainingMode);
    const graph = getFsmGraph(flightModeId);

    // Build FSM info for the current phase
    const requirementsChecklist = buildRequirementChecklist(toStateId(session.currentPhaseName), graph);

    // Return session with current_phase_info
    return {
      ...session,
      initial_phase_info: {
        name: session.currentPhaseName,
        requirementsChecklist,
      },
    };
  }

  /**
   * Get session records (transmissions with evaluations) for a session owned by the user
   */
  static async getSessionRecords(userId: string, sessionId: string, page: number = 1, pageSize: number = 50) {
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId },
      select: { id: true },
    });

    if (!session) {
      throw new Error('Session not found');
    }

    const total = await prisma.transmissionEvent.count({ where: { sessionId } });

    const transmissions = await prisma.transmissionEvent.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        createdAt: true,
        sender: true,
        current_phase: true,
        audio_transcript: true,
        audio_url: true,
        evaluation: {
          select: {
            score: true,
            feedback: true,
            exampleAnswer: true,
          },
        },
      },
    });

    const items = transmissions.map(t => ({
      id: t.id,
      timestamp: t.createdAt,
      sender: t.sender,
      phase: t.current_phase,
      transcript: t.audio_transcript,
      audioUrl: t.audio_url,
      evaluation: t.evaluation ? {
        score: t.evaluation.score,
        feedback: t.evaluation.feedback,
        exampleAnswer: t.evaluation.exampleAnswer,
      } : null,
    }));

    return {
      items,
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    };
  }

  /**
   * Compute per-phase and overall average scores for a session
   */
  static async getSessionSummary(userId: string, sessionId: string) {
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId },
      select: { id: true },
    });

    if (!session) {
      throw new Error('Session not found');
    }

    const transmissions = await prisma.transmissionEvent.findMany({
      where: { sessionId, evaluation: { isNot: null } },
      select: {
        current_phase: true,
        evaluation: { select: { score: true } },
      },
    });

    const phaseToScores: Record<string, number[]> = {};
    transmissions.forEach(t => {
      const score = t.evaluation?.score ?? null;
      if (score === null || score === undefined) return;
      if (!phaseToScores[t.current_phase]) phaseToScores[t.current_phase] = [];
      phaseToScores[t.current_phase].push(score);
    });

    const phaseAverages: Record<string, number> = {};
    let allScores: number[] = [];
    Object.entries(phaseToScores).forEach(([phase, scores]) => {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      phaseAverages[phase] = Math.round(avg * 10) / 10;
      allScores = allScores.concat(scores);
    });

    const overallAverage = allScores.length
      ? Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 10) / 10
      : null;

    return {
      sessionId,
      overallAverage,
      phaseAverages,
    };
  }

  /**
   * Get the latest inferred location for a session
   */
  static async getSessionLocation(userId: string, sessionId: string, logger: FastifyBaseLogger) {
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new Error('Session not found');
    }

    // Build agent context for environment agent
    const currentAirportIcao = getEffectiveAirportIcao(
      session.airportIcao,
      (session as any).activeAirportIcao
    );
    const { airportInfoJson } = await getAirportInfoForAgent(currentAirportIcao, logger);

    const history = await SessionHistoryService.getSessionHistory(sessionId, 20, true) as string[];
    const inferredLocation = await EnvironmentAgentService.inferLocation(
      session.currentPhaseName,
      history,
      {
        airportIcao: currentAirportIcao,
        aircraftTailNumber: session.aircraftTailNumber,
        airportInfo: airportInfoJson,
      },
      logger
    );

    await LocationService.updateLocation(sessionId, inferredLocation, session.currentPhaseName);

    return inferredLocation;
  }

  /**
   * Delete a session and all related data (must belong to the user)
   */
  static async deleteSession(
    userId: string,
    sessionId: string,
    logger: FastifyBaseLogger = defaultLogger
  ) {
    // Verify session belongs to user
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId },
      select: { id: true },
    });

    if (!session) {
      throw new Error('Session not found');
    }

    // Get all transmission events for this session
    const transmissionEvents = await prisma.transmissionEvent.findMany({
      where: { sessionId },
      select: { id: true, audio_url: true },
    });

    const transmissionEventIds = transmissionEvents.map(e => e.id);
    const audioFiles = transmissionEvents
      .map(e => e.audio_url)
      .filter((key): key is string => !!key);

    if (audioFiles.length > 0) {
      await S3Service.deleteAudioBatch(audioFiles, logger);
    }

    // Delete evaluations linked to transmission events
    if (transmissionEventIds.length > 0) {
      await prisma.evaluation.deleteMany({
        where: { transmissionEventId: { in: transmissionEventIds } },
      });
    }

    // Delete transmission events
    await prisma.transmissionEvent.deleteMany({
      where: { sessionId },
    });

    // Delete phase advance events
    await prisma.phaseAdvanceEvent.deleteMany({
      where: { sessionId },
    });

    // Delete the session
    await prisma.session.delete({
      where: { id: sessionId },
    });

    return { success: true };
  }
}