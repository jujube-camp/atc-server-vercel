import { FastifyRequest, FastifyReply } from 'fastify';
import { SessionService } from '../services/sessionService.js';
import { CreateSessionRequest as CreateSessionInput } from '../common/index.js';

export class SessionController {
  /**
   * List sessions for the authenticated user (latest 20)
   */
  static async getUserSessions(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const userId = (request.user as any).userId;
    const sessions = await SessionService.getUserSessions(userId);
    return reply.send(sessions);
  }

  /**
   * Create a new session
   */
  static async createSession(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const userId = (request.user as any).userId;
    const {
      airportIcao,
      arrivalAirport,
      aircraftTailNumber,
      aircraftType,
      trainingMode,
      radioFrequency1,
      currentLocation,
      squawk,
    } = request.body as CreateSessionInput;

    const session = await SessionService.createSession({
      userId,
      airportIcao,
      arrivalAirport,
      aircraftTailNumber,
      trainingMode,
      aircraftType,
      radioFrequency1,
      currentLocation,
      squawk,
    }, request.server.log);

    return reply.code(201).send(session);
  }

  /**
   * Get session records (transmissions with evaluations)
   */
  static async getSessionRecords(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const userId = (request.user as any).userId;
    const { sessionId } = (request.params as any);
    const { page = 1, pageSize = 50 } = (request.query as any) || {};
    const result = await SessionService.getSessionRecords(userId, sessionId, page, pageSize);
    return reply.send(result);
  }

  /**
   * Get session score summary (per phase averages and overall)
   */
  static async getSessionSummary(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const userId = (request.user as any).userId;
    const { sessionId } = (request.params as any);
    const summary = await SessionService.getSessionSummary(userId, sessionId);
    return reply.send(summary);
  }

  /**
   * Get a session by ID
   */
  static async getSession(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const userId = (request.user as any).userId;
    const { sessionId } = (request.params as any);
    const session = await SessionService.getSession(userId, sessionId);
    return reply.send(session);
  }

  /**
   * Get the latest inferred location for a session
   */
  static async getSessionLocation(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const userId = (request.user as any).userId;
    const { sessionId } = (request.params as any);
    const currentLocation = await SessionService.getSessionLocation(userId, sessionId, request.server.log);
    return reply.send({ currentLocation });
  }

  /**
   * Delete a session
   */
  static async deleteSession(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const userId = (request.user as any).userId;
    const { sessionId } = (request.params as any);
    await SessionService.deleteSession(userId, sessionId, request.server.log);
    return reply.code(200).send({ success: true });
  }
}
