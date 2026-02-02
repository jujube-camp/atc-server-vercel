import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { RecordingController } from '../controllers/recordingController.js';
import multipart from '@fastify/multipart';

const recordingRoutes: FastifyPluginAsync = async (fastify) => {
  const server = fastify.withTypeProvider<ZodTypeProvider>();

  // Register multipart plugin for file uploads (4MB to stay under Vercel 4.5MB limit; client enforces <90s audio)
  await server.register(multipart, {
    limits: {
      fileSize: 4 * 1024 * 1024, // 4MB
    },
  });

  /**
   * POST /api/v1/recordings
   * Create a new recording
   */
  server.post(
    '/',
    {
      onRequest: [server.authenticate],
      schema: {
        body: z.object({
          sessionId: z.string(),
        }),
        response: {
          201: z.object({
            id: z.string(),
            userId: z.string(),
            sessionId: z.string(),
            status: z.string(),
            createdAt: z.date(),
            updatedAt: z.date(),
          }),
        },
      },
    },
    async (request, reply) => {
      await RecordingController.createRecording(request, reply);
    }
  );

  /**
   * GET /api/v1/recordings
   * Get all recordings for user
   */
  server.get(
    '/',
    {
      onRequest: [server.authenticate],
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().positive().max(100).optional(),
        }).optional(),
        response: {
          200: z.array(z.object({
            id: z.string(),
            userId: z.string(),
            sessionId: z.string(),
            status: z.string(),
            audioUrl: z.string().nullable(),
            reportUrl: z.string().nullable(),
            createdAt: z.date(),
            updatedAt: z.date(),
          })),
        },
      },
    },
    async (request, reply) => {
      await RecordingController.getUserRecordings(request, reply);
    }
  );

  /**
   * GET /api/v1/recordings/:sessionId
   * Get recording by sessionId
   */
  server.get(
    '/:sessionId',
    {
      onRequest: [server.authenticate],
      schema: {
        params: z.object({
          sessionId: z.string(),
        }),
        response: {
          200: z.object({
            id: z.string(),
            userId: z.string(),
            sessionId: z.string(),
            status: z.string(),
            audioS3Key: z.string().nullable(),
            audioUrl: z.string().nullable(),
            jobId: z.string().nullable(),
            reportS3Key: z.string().nullable(),
            reportUrl: z.string().nullable(),
            summaryS3Key: z.string().nullable(),
            summaryUrl: z.string().nullable(),
            timelineS3Key: z.string().nullable(),
            timelineUrl: z.string().nullable(),
            errorMessage: z.string().nullable(),
            createdAt: z.date(),
            updatedAt: z.date(),
          }),
        },
      },
    },
    async (request, reply) => {
      await RecordingController.getRecording(request, reply);
    }
  );

  /**
   * POST /api/v1/recordings/:sessionId/upload
   * Upload audio file
   */
  server.post(
    '/:sessionId/upload',
    {
      onRequest: [server.authenticate],
      schema: {
        params: z.object({
          sessionId: z.string(),
        }),
        response: {
          200: z.object({
            s3Key: z.string(),
            audioUrl: z.string().nullable(),
          }),
        },
      },
    },
    async (request, reply) => {
      await RecordingController.uploadRecording(request, reply);
    }
  );

  /**
   * POST /api/v1/recordings/:sessionId/analyze
   * Start analysis
   */
  server.post(
    '/:sessionId/analyze',
    {
      onRequest: [server.authenticate],
      schema: {
        params: z.object({
          sessionId: z.string(),
        }),
        body: z.object({
          vadType: z.string().optional(),
          vadParams: z.record(z.any()).optional(),
          maxDurationMs: z.number().int().positive().optional(),
        }).optional(),
        response: {
          200: z.object({
            jobId: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      await RecordingController.startAnalysis(request, reply);
    }
  );

  /**
   * GET /api/v1/recordings/:sessionId/status
   * Check analysis status
   */
  server.get(
    '/:sessionId/status',
    {
      onRequest: [server.authenticate],
      schema: {
        params: z.object({
          sessionId: z.string(),
        }),
        response: {
          200: z.object({
            status: z.string(),
            jobId: z.string().nullable(),
            progress: z.record(z.any()).nullable(),
            error: z.string().nullable(),
            reportUrl: z.string().nullable(),
            summaryUrl: z.string().nullable(),
            timelineUrl: z.string().nullable(),
          }),
        },
      },
    },
    async (request, reply) => {
      await RecordingController.getAnalysisStatus(request, reply);
    }
  );

  /**
   * GET /api/v1/recordings/:sessionId/report
   * Get report content
   */
  server.get(
    '/:sessionId/report',
    {
      onRequest: [server.authenticate],
      schema: {
        params: z.object({
          sessionId: z.string(),
        }),
        response: {
          200: z.string(),
        },
      },
    },
    async (request, reply) => {
      await RecordingController.getReport(request, reply);
    }
  );

  /**
   * DELETE /api/v1/recordings/:recordingId
   * Delete a recording history entry by recording id
   *
   * This only deletes the database row used for history display.
   * It does NOT delete audio files or analysis artifacts from S3.
   */
  server.delete(
    '/:recordingId',
    {
      onRequest: [server.authenticate],
      schema: {
        params: z.object({
          recordingId: z.string(),
        }),
        response: {
          200: z.object({
            success: z.boolean(),
          }),
          404: z.object({
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      await RecordingController.deleteRecording(request, reply);
    }
  );
};

export default recordingRoutes;

