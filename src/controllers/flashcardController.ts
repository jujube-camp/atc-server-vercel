import type { FastifyReply, FastifyRequest } from 'fastify';
import { FlashcardService } from '../services/flashcardService.js';

export class FlashcardController {
  static async getFlashcards(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    try {
      const { topic } = request.query as { topic?: string };
      const exercises = await FlashcardService.getExercises(topic);
      return reply.send(exercises);
    } catch (error) {
      request.log.error(
        { error: error instanceof Error ? error.message : error },
        'Failed to fetch flashcard exercises',
      );
      return reply.code(500).send({ error: 'Failed to fetch flashcard exercises' });
    }
  }
}
