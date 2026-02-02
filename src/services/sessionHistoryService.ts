import { prisma } from '../utils/prisma.js';

export interface TransmissionEventHistory {
  type: 'transmission';
  timestamp: Date;
  phase_id: number;
  audio_transcript: string | null;
  sender: string;
  metadata: string | null;
}

export interface PhaseAdvanceEventHistory {
  type: 'phase_advance';
  timestamp: Date;
  from_phase: number;
  to_phase: number;
}

export type SessionEventHistory = TransmissionEventHistory | PhaseAdvanceEventHistory;

/**
 * Convert a session event to a string representation
 * @param event - The session event to convert
 * @param index - The index of the event in the history (for relative ordering)
 * @returns String representation of the event
 */
export function eventToString(event: SessionEventHistory, index?: number): string {
  const indexPrefix = index !== undefined ? `t${index} ` : '';
  
  if (event.type === 'transmission') {
    const message = event.audio_transcript || '[NO_MESSAGE]';
    // Parse JSON metadata and show expects_response for ATC messages
    let metadataStr = '';
    if (event.metadata && event.sender !== 'PILOT') {
      try {
        const metadata = JSON.parse(event.metadata);
        if (metadata.expected !== undefined) {
          metadataStr = ` (expects_response: ${metadata.expected})`;
        }
      } catch (e) {
        // If metadata is not valid JSON, skip it
      }
    }
    return `${indexPrefix}[Transmission] Phase: ${event.phase_id} ${event.sender}: ${message}${metadataStr}`;
  } else {
    return `${indexPrefix}[Phase advance] ${event.from_phase} → ${event.to_phase}`;
  }
}

export class SessionHistoryService {
  /**
   * Get the latest k events for a session, combining transmission and phase advance events
   * @param sessionId - The session ID to get history for
   * @param limit - Maximum number of events to return (default: 50)
   * @param asStrings - If true, returns array of strings instead of objects (default: false)
   * @returns Array of session events sorted by timestamp ascending (oldest → newest)
   */
  static async getSessionHistory(
    sessionId: string,
    limit: number = 50,
    asStrings: boolean = false
  ): Promise<SessionEventHistory[] | string[]> {
    // Verify session exists
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new Error('Session not found');
    }

    // Get transmission events with limit (ordered desc to get the latest ones)
    const transmissionEvents = await prisma.transmissionEvent.findMany({
      where: { sessionId },
      select: {
        id: true,
        createdAt: true,
        current_phase: true,
        audio_transcript: true,
        sender: true,
        metadata: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Get phase advance events with limit (ordered desc to get the latest ones)
    const phaseAdvanceEvents = await prisma.phaseAdvanceEvent.findMany({
      where: { sessionId },
      select: {
        id: true,
        createdAt: true,
        from_phase: true,
        to_phase: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Combine and transform events
    const allEvents: SessionEventHistory[] = [
      ...transmissionEvents.map((event: any) => ({
        type: 'transmission' as const,
        timestamp: event.createdAt,
        phase_id: event.current_phase,
        audio_transcript: event.audio_transcript,
        sender: event.sender,
        metadata: event.metadata ?? null,
      })),
      ...phaseAdvanceEvents.map((event: any) => ({
        type: 'phase_advance' as const,
        timestamp: event.createdAt,
        from_phase: event.from_phase,
        to_phase: event.to_phase,
      })),
    ];

    // Sort all events by timestamp descending to get the latest events
    allEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Take the latest k events
    const limitedEvents = allEvents.slice(0, limit);

    // Reverse to get chronological order (oldest → newest)
    limitedEvents.reverse();

    // Return as strings if requested
    if (asStrings) {
      return limitedEvents.map((event, index) => eventToString(event, index + 1));
    }

    return limitedEvents;
  }

}
