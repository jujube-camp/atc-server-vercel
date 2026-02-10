import { prisma } from '../utils/prisma.js';
import { flashcardContentSchema, type FlashcardExercise } from '../common/index.js';

export class FlashcardService {
  /**
   * Fetch all active flashcard exercises, optionally filtered by topic.
   * Returns exercises ordered by displayOrder.
   */
  static async getExercises(topic?: string): Promise<FlashcardExercise[]> {
    const records = await prisma.flashcardExercise.findMany({
      where: {
        isActive: true,
        ...(topic ? { topic } : {}),
      },
      orderBy: { displayOrder: 'asc' },
    });

    return records
      .map((record) => {
        const contentParsed = flashcardContentSchema.safeParse(record.content);
        if (!contentParsed.success) {
          return null;
        }
        return {
          id: record.id,
          topic: record.topic,
          content: contentParsed.data,
          displayOrder: record.displayOrder,
        };
      })
      .filter((e): e is FlashcardExercise => e !== null);
  }
}
