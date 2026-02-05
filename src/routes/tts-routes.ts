import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { TTSController } from '../controllers/ttsController.js';

const ttsRoutes: FastifyPluginAsync = async (fastify) => {
  const server = fastify.withTypeProvider<ZodTypeProvider>();

  /**
   * GET /api/v1/tts/fish-audio/stream
   * Generate TTS audio response using Fish Audio HTTP API
   * Query params:
   *   - text: string (required) - Text to convert to speech
   *   - format?: 'wav' | 'pcm' | 'mp3' | 'opus' (default: 'wav')
   *   - reference_id?: string - Reference audio ID for voice cloning
   *   - latency?: 'normal' | 'balanced' (default: 'normal')
   *   - radioEffects?: 'standard' | 'light' | 'heavy' | 'clear' (default: 'standard')
   *
   * Returns: audio data (format depends on format parameter)
   */
  server.get(
    '/fish-audio/stream',
    {
      onRequest: [server.authenticate],
      schema: {
        querystring: z.object({
          text: z.string().min(1),
          format: z.enum(['wav', 'pcm', 'mp3', 'opus']).optional(),
          reference_id: z.string().optional(),
          latency: z.enum(['normal', 'balanced']).optional(),
          session_id: z.string().min(1), // Required - needed for S3 storage
          transmission_id: z.string().optional(),
          radioEffects: z.enum(['standard', 'light', 'heavy', 'clear']).optional(),
        }),
        // No response schema - binary streams cannot be validated by ZodTypeProvider
      },
    },
    async (request, reply) => {
      await TTSController.generateFishAudio(request, reply);
    }
  );
};

export default ttsRoutes;

