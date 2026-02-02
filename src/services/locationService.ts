import { prisma } from '../utils/prisma.js';

export class LocationService {
  /**
   * Update session location and create history event (only if location changed)
   * @param sessionId - Session ID
   * @param location - New location string
   * @param phase - Current phase name
   */
  static async updateLocation(
    sessionId: string,
    location: string,
    phase: string
  ): Promise<void> {
    // Get current location
    const currentLocation = await this.getCurrentLocation(sessionId);
    
    // Only update if location actually changed
    if (currentLocation === location) {
      return;
    }

    await prisma.$transaction([
      // Update current location on session
      prisma.session.update({
        where: { id: sessionId },
        data: { currentLocation: location },
      }),
      // Create location event for history
      prisma.locationEvent.create({
        data: { sessionId, location, phase },
      }),
    ]);
  }

  /**
   * Get current location for a session
   * @param sessionId - Session ID
   * @returns Current location string or null
   */
  static async getCurrentLocation(sessionId: string): Promise<string | null> {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { currentLocation: true },
    });
    return session?.currentLocation ?? null;
  }
}

