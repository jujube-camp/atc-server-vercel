import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../utils/prisma.js';

export class AircraftTypeController {
  static async list(_request: FastifyRequest, reply: FastifyReply) {
    const aircraftTypes = await prisma.aircraftType.findMany({
      where: { isActive: true },
      orderBy: [
        { displayOrder: 'asc' },
        { label: 'asc' },
      ],
    });

    return reply.send(aircraftTypes);
  }
}

