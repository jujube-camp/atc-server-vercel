import { FastifyRequest, FastifyReply } from 'fastify';
import { CommunicationService } from '../services/communication-service.js';
import { PhaseService } from '../services/phaseService.js';
import { TransmissionRequest } from '../common/index.js';
import type { PhaseName } from '../common/index.js';

/**
 * Controller for user-triggered events (transmission, phase advance)
 */
export class EventController {
  /**
   * Process a transmission event (pilot speaking on radio)
   */
  static async processTransmission(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const userId = (request.user as any).userId;
    const transmissionRequest = request.body as TransmissionRequest;

    request.server.log.info('[EventController] Processing transmission event');

    const response = await CommunicationService.processTransmission(
      transmissionRequest.sessionId,
      userId,
      transmissionRequest,
      request.server.log
    );
    return reply.code(201).send(response);
  }

  /**
   * Process a phase advance event (pilot advancing to next phase)
   */
  static async advancePhase(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const userId = (request.user as any).userId;
    const { sessionId, currentPhase, nextPhase } = request.body as {
      sessionId: string;
      currentPhase: PhaseName;
      nextPhase: PhaseName;
    };

    request.server.log.info(
      { sessionId, currentPhase, nextPhase },
      '[EventController] Processing phase advance event'
    );

    const response = await PhaseService.advancePhase(
      sessionId,
      userId,
      currentPhase,
      nextPhase,
      request.server.log
    );

    return reply.send(response);
  }
}

