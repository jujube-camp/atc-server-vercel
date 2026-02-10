import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { flashcardExerciseSchema } from '../common/index.js';
import { FlashcardController } from '../controllers/flashcardController.js';

const flashcardRoutes: FastifyPluginAsync = async (fastify) => {
  const server = fastify.withTypeProvider<ZodTypeProvider>();

  server.get(
    '/',
    {
      schema: {
        querystring: z.object({
          topic: z.string().optional(),
        }),
        response: {
          200: z.array(flashcardExerciseSchema),
        },
      },
    },
    async (request, reply) => {
      await FlashcardController.getFlashcards(request, reply);
    },
  );
};

export default flashcardRoutes;
