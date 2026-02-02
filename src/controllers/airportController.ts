import { FastifyRequest, FastifyReply } from 'fastify';
import { AirportService } from '../services/airportService.js';

export class AirportController {
  /**
   * Get airport by ICAO code
   */
  static async getAirportByIcaoCode(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const { icao_code } = request.query as { icao_code: string };
    const airport = await AirportService.getAirportByIcaoCode(icao_code);
    return reply.send(airport);
  }

  /**
   * Get all airports with optional field selection
   */
  static async getAllAirports(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const { fields } = (request.query ?? {}) as {
      fields?: string | string[];
    };

    const rawFields = Array.isArray(fields)
      ? fields
      : fields
        ? fields.split(',').map(part => part.trim()).filter(Boolean)
        : undefined;

    const fieldArray = rawFields?.flatMap(entry =>
      entry.split(',').map(part => part.trim()).filter(Boolean)
    );

    const airports = await AirportService.getAllAirports(fieldArray);
    return reply.send(airports);
  }
}

