import { FastifyRequest, FastifyReply } from 'fastify';
import { FishAudioService } from '../services/fishAudioService.js';
import { S3Service } from '../services/s3Service.js';
import { env } from '../config/env.js';

export class TTSController {
  /**
   * Generate TTS audio response using Fish Audio HTTP API
   * GET /api/v1/tts/fish-audio/stream?text=...&format=...
   */
  static async generateFishAudio(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const {
      text,
      format = 'mp3',
      reference_id,
      latency = 'normal',
      session_id,
      transmission_id,
      radioEffects,
    } = request.query as {
      text?: string;
      format?: 'wav' | 'pcm' | 'mp3' | 'opus';
      reference_id?: string;
      latency?: 'normal' | 'balanced';
      session_id?: string;
      transmission_id?: string;
      radioEffects?: 'standard' | 'light' | 'heavy' | 'clear';
    };

    if (!text) {
      return reply.code(400).send({
        error: 'Missing required parameter: text',
      });
    }

    if (!session_id) {
      return reply.code(400).send({
        error: 'Missing required parameter: session_id',
      });
    }

    if (!env.FISH_AUDIO_API_KEY) {
      return reply.code(500).send({
        error: 'FISH_AUDIO_API_KEY is not configured',
      });
    }

    try {
      FishAudioService.setApiKey(env.FISH_AUDIO_API_KEY);

      // Generate audio with buffer for S3 upload
      const ttsStartTime = Date.now();
      const { buffer, stream, format: audioFormat } = await FishAudioService.generateAudioWithBuffer({
        text,
        format,
        latency,
        reference_id: reference_id || env.FISH_AUDIO_REFERENCE_ID,
        radioEffects,
      });
      const ttsLatency = Date.now() - ttsStartTime;
      
      request.server.log.info(
        { 
          textLength: text.length,
          format: audioFormat,
          latencyMs: ttsLatency,
          latencySeconds: (ttsLatency / 1000).toFixed(2),
          reference_id: reference_id || env.FISH_AUDIO_REFERENCE_ID
        }, 
        `[TTSController] TTS generation completed - Latency: ${ttsLatency}ms (${(ttsLatency / 1000).toFixed(2)}s)`
      );

      // Save to S3 asynchronously (fire-and-forget) within the session directory
      const audioKey = S3Service.generateAudioKey(session_id, 'atc', audioFormat, transmission_id);
      const contentType = S3Service.getContentType(audioFormat);
      
      // Fire-and-forget S3 upload and database update
      S3Service.uploadAudio(buffer, audioKey, contentType, request.server.log)
        .then(async (audioFileName) => {
          request.server.log.info({ audioFileName, text: text.substring(0, 50) }, '[TTSController] Fish Audio saved to S3');
          
          // If transmission_id is provided, update the database with audio file name
          if (transmission_id) {
            const { prisma } = await import('../utils/prisma.js');
            await prisma.transmissionEvent.update({
              where: { id: transmission_id },
              data: { audio_url: audioFileName },
            });
          }
        })
        .catch((error) => {
          request.server.log.error({ error }, '[TTSController] Failed to save Fish Audio to S3');
        });

      const contentTypeMap: Record<string, string> = {
        mp3: 'audio/mpeg',
        wav: 'audio/wav',
        pcm: 'audio/pcm',
        opus: 'audio/opus',
      };

      // Use actual format returned from service (may differ from requested format)
      const responseFormat = audioFormat || format;

      // Hijack the response to bypass Fastify's response serialization
      // This prevents schema validation errors for binary streams
      reply.hijack();

      reply.raw.statusCode = 200;
      reply.raw.setHeader('Content-Type', contentTypeMap[responseFormat] || 'audio/mpeg');
      reply.raw.setHeader('Content-Disposition', `inline; filename="tts-audio.${responseFormat}"`);
      reply.raw.setHeader('Cache-Control', 'no-cache');
      reply.raw.setHeader('X-Content-Type-Options', 'nosniff');
      
      // Pipe the stream directly to response
      stream.pipe(reply.raw);
      return;
    } catch (error) {
      request.server.log.error({ error }, '[TTSController] Error generating Fish Audio');
      return reply.code(500).send({
        error: 'Failed to generate audio',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

