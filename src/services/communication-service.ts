import { prisma } from '../utils/prisma.js';
import type { Prisma } from '@prisma/client';
import { 
  getFsmGraph,
  trainingModeToFlightModeId,
  TransmissionRequest,
  TransmissionResponse,
  AtcResponse,
  type PhaseName,
  type FsmGraph,
} from '../common/index.js';
import { OpenAIService } from './openAIService.js';
import { env } from '../config/env.js';
import {
  SessionHistoryService,
  eventToString,
  type SessionEventHistory,
} from './sessionHistoryService.js';
import { getUserFrequencyType } from '../utils/airportUtils.js';
import type { FastifyBaseLogger } from 'fastify';
import { AtcAgentService } from './atcAgentService.js';
import { PilotCommunicationEvaluationService } from './pilotCommunicationEvaluationService.js';
import { LocationService } from './locationService.js';
import { S3Service } from './s3Service.js';
import { StatefulEnvAgent } from './envAgent.js';

import { buildAgentContext, getAirportInfoForAgent, getEffectiveAirportIcao } from '../utils/agentContextHelper.js';

export class CommunicationService {

  /**
   * Trigger async evaluation (fire-and-forget)
   */
  private static triggerAsyncEvaluation(
    transmissionId: string,
    pilotTranscript: string,
    sessionHistory: string[],  // Last 10 transmissions (already fetched)
    currentPhase: PhaseName,
    airportIcao: string,
    logger: FastifyBaseLogger,
    fsmGraph: FsmGraph
  ): void {
    // Fire-and-forget async evaluation
    (async () => {
      try {
        const state = fsmGraph.getState(currentPhase);
        const currentPhaseInfo = {
          current_phase: state.id,
          label: state.label,
          atc_guidance: state.atc_guidance,
        };
        
        // Use last 10 items from the provided history (history already excludes current pilot transcript)
        const historyForEvaluation = sessionHistory.slice(-10);
        
        const evaluationResult = await PilotCommunicationEvaluationService.evaluatePilotCommunication(
          {
            pilot_transcript: pilotTranscript,
            session_history: historyForEvaluation,
            current_phase_info: currentPhaseInfo,
            context: {
              airport_icao: airportIcao,
            },
          },
          logger
        );

        await prisma.evaluation.create({
          data: {
            transmissionEventId: transmissionId,
            score: Math.round(evaluationResult.feedback_score),
            feedback: evaluationResult.feedback_comment,
            exampleAnswer: null,
          },
        });

        // Combined log with pilot communication evaluation details
        logger.info(
          { 
            transmissionId,
            score: evaluationResult.feedback_score,
            comment_length: evaluationResult.feedback_comment.length
          }, 
          '[CommunicationService] Pilot communication evaluation completed'
        );
      } catch (error) {
        logger.error({ error, transmissionId }, '[CommunicationService] Async evaluation failed');
      }
    })();
  } 

  /**
   * Find the most recent ATC transmission (non-pilot) in the session history.
   * Used to provide transcription context so the speech model prefers words
   * consistent with the last instruction without hallucinating new content.
   */
  private static getLastAtcInstruction(historyEvents: SessionEventHistory[]): string | null {
    for (let i = historyEvents.length - 1; i >= 0; i--) {
      const event = historyEvents[i];
      if (
        event.type === 'transmission' &&
        event.sender !== 'PILOT' &&
        event.audio_transcript &&
        event.audio_transcript.trim().length > 0
      ) {
        return event.audio_transcript;
      }
    }
    return null;
  }

  /**
   * Process a transmission request - handles pilot audio communication
   */
  static async processTransmission(
    sessionId: string,
    userId: string,
    request: TransmissionRequest,
    logger: FastifyBaseLogger
  ): Promise<TransmissionResponse> {
    const transmissionStartTime = Date.now();
    logger.info(`[CommunicationService] Processing transmission for session ${sessionId}`);

    // Get and validate session
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new Error('Session not found');
    }

    // Get FsmGraph based on session's training mode
    const flightModeId = trainingModeToFlightModeId(session.trainingMode);
    const fsmGraph = getFsmGraph(flightModeId);

    // Get FSM state and flight mode info
    const state = fsmGraph.getState(request.currentPhase);
    const envTools = state.env_tools;
    
    // Fetch recent session history once so we can (1) bias transcription with the
    // latest ATC instruction and (2) reuse it later for the ATC agent/evaluation.
    const historyEvents = await SessionHistoryService.getSessionHistory(sessionId, 20, false) as SessionEventHistory[];
    const history = historyEvents.map((event, index) => eventToString(event, index + 1));
    const lastAtcInstruction = CommunicationService.getLastAtcInstruction(historyEvents);

    // Use activeAirportIcao if set, otherwise fallback to airportIcao
    const currentAirportIcao = getEffectiveAirportIcao(
      session.airportIcao,
      (session as any).activeAirportIcao
    );

    // Initialize OpenAI service for transcription
    const openaiService = new OpenAIService(env.OPENAI_API_KEY);

    // Step 1: Transcribe audio
      const audioBuffer = Buffer.from(request.audioData, 'base64');

    const baseTranscriptionPrompt = `Please transcribe aviation radio communication from a pilot at ${currentAirportIcao} airport.
For numbers: spell out (e.g., "one two three" not "123")

If there is no speech or it is unintelligible, respond only with [UNTRANSCRIBABLE].
Do not guess or infer content.
Return exactly [UNTRANSCRIBABLE] if unsure.`;

    const transcriptionPrompt = lastAtcInstruction
      ? `${baseTranscriptionPrompt}

Context for disambiguation:
• Last ATC instruction (reference only): "${lastAtcInstruction}"
• Prefer homophones that keep the instruction intact when unsure, but never invent or "correct" content that clearly differs.`
      : baseTranscriptionPrompt;

    logger.info('[CommunicationService] Transcribing audio...');
    const transcriptionStartTime = Date.now();
    const transcription = await openaiService.transcribeAudio(audioBuffer, {
      prompt: transcriptionPrompt,
      model: 'gpt-4o-transcribe'
    }, logger);
    const transcriptionLatency = Date.now() - transcriptionStartTime;
    
    logger.info(
      { 
        transcription,
        latencyMs: transcriptionLatency,
        latencySeconds: (transcriptionLatency / 1000).toFixed(2)
      }, 
      `[CommunicationService] Transcription completed - Latency: ${transcriptionLatency}ms (${(transcriptionLatency / 1000).toFixed(2)}s)`
    );

    // Get airport information for frequency type lookup (structuredInfo needed for getUserFrequencyType)
    const { structuredInfo } = await getAirportInfoForAgent(currentAirportIcao, logger);

    // Determine user's selected frequency type
    const userSelectedFrequency = (request as TransmissionRequest & { radioFrequency1?: string }).radioFrequency1 ?? null;
    const userSelectedFrequencyType = getUserFrequencyType(structuredInfo, userSelectedFrequency);

    // Get current location before ATC agent call
    const currentLocation = await LocationService.getCurrentLocation(sessionId);

    // Store pilot transmission event (without audio URL initially)
    const pilotTransmission = await prisma.transmissionEvent.create({
      data: {
        sessionId: request.sessionId,
        sender: 'PILOT',
        current_phase: request.currentPhase,
        audio_transcript: transcription,
        audio_url: null, // Will be updated asynchronously
      },
    });

    // Asynchronously upload user audio to S3 and update database (fire-and-forget)
    const audioFormat = S3Service.getFormatFromMimeType(request.audioMimeType);
    const audioKey = S3Service.generateAudioKey(sessionId, 'user', audioFormat, pilotTransmission.id);
    const contentType = S3Service.getContentType(audioFormat);
    
    S3Service.uploadAudio(audioBuffer, audioKey, contentType, logger)
      .then(async (audioFileName) => {
        // Update the transmission event with the relative file path
        await prisma.transmissionEvent.update({
          where: { id: pilotTransmission.id },
          data: { audio_url: audioFileName },
        });
      })
      .catch((error) => {
        logger.error({ error, transmissionId: pilotTransmission.id }, '[CommunicationService] Failed to save user audio to S3');
      });

    // Step 2: Call ATC Agent to get response (with current location)
    
    // Create environment agent for runway situation awareness
    const envAgent = new StatefulEnvAgent(sessionId, structuredInfo ?? undefined);
    
    const atcAgentResult = await AtcAgentService.generateAtcResponse(
      {
        ...(await buildAgentContext(
          fsmGraph,
          request.currentPhase,
          currentAirportIcao,
          session.aircraftTailNumber,
          history,
          {
            userSelectedFrequencyType,
            currentLocation: currentLocation || 'Unknown',
          },
          logger
        )),
        trigger_input: transcription,
        trigger_type: 'pilot_speech',
      },
      logger,
      { envAgent, envTools }
    );


    // Step 2.5: Store ATC response (always store metadata and message, even if message is empty)
    // Use frequency type as sender (e.g., "GND", "TWR", "TWR/CTAF", "UNKNOWN")
    const sender = userSelectedFrequencyType;
    let atcResponse: AtcResponse | undefined;
    const atcTransmission = await prisma.transmissionEvent.create({
      data: {
        sessionId: request.sessionId,
        sender: sender as any, // Type assertion needed for frequency types like "GND", "TWR", etc.
        current_phase: request.currentPhase,
        audio_transcript: atcAgentResult.message || "",
        audio_url: null, // Will be updated by TTS controller when audio is generated
        metadata: JSON.stringify({
          expected: atcAgentResult.expected,
        }),
      } as Prisma.TransmissionEventUncheckedCreateInput,
    });

    if (atcAgentResult.message && atcAgentResult.message.trim() !== '') {
      atcResponse = {
        message: atcAgentResult.message,
        transmissionId: atcTransmission.id, // Include transmission ID for TTS
      };
    }

    // Step 4: Trigger async evaluation (fire-and-forget)
    // Pass the already-fetched history (last 10) - evaluation will use last 10
    this.triggerAsyncEvaluation(
      pilotTransmission.id,
      transcription,
      history,
      request.currentPhase,
      currentAirportIcao,
      logger,
      fsmGraph
    );

    // Update session timestamp and persist latest radio frequency selection if provided
    const sessionUpdateData: Prisma.SessionUpdateInput = {
      updatedAt: new Date(),
    };
    if (userSelectedFrequency) {
      sessionUpdateData.radioFrequency1 = userSelectedFrequency;
    }
    await prisma.session.update({
      where: { id: request.sessionId },
      data: sessionUpdateData,
    });

    // Build and return response
      const response: TransmissionResponse = {
        success: true,
      transcription,
      atcResponse,
      };

      const transmissionLatency = Date.now() - transmissionStartTime;
      const atcMessage = atcResponse?.message || '';
      logger.info(
        { 
          sessionId, 
          latencyMs: transmissionLatency,
          latencySeconds: (transmissionLatency / 1000).toFixed(2),
          atcMessage,
          transcription
        }, 
        `[CommunicationService] Transmission processing completed - Latency: ${transmissionLatency}ms (${(transmissionLatency / 1000).toFixed(2)}s), ATC Message: "${atcMessage}"`
      );

      return response;
  }
}
