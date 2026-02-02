import { FastifyRequest, FastifyReply } from 'fastify';
import { RecordingService, CompactFlightData } from '../services/recordingService.js';

/**
 * Controller for recording-related operations
 */
export class RecordingController {
  /**
   * Create a new recording
   * POST /api/v1/recordings
   */
  static async createRecording(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const userId = (request.user as any).userId;
    const { sessionId } = request.body as { sessionId: string };

    if (!userId) {
      return reply.code(401).send({ message: 'User not authenticated' });
    }

    if (!sessionId) {
      return reply.code(400).send({ message: 'sessionId is required' });
    }

    request.server.log.info({ userId, sessionId }, '[RecordingController] Creating recording');

    try {
      // Check if recording already exists for this session
      let recording;
      try {
        recording = await RecordingService.getRecording(userId, sessionId);
        // If recording exists, return it instead of creating a new one
        return reply.code(200).send(recording);
      } catch (error) {
        // If recording doesn't exist, create a new one
        if (error instanceof Error && error.message === 'Recording not found') {
          recording = await RecordingService.createRecording(
            { userId, sessionId },
            request.server.log
          );
          return reply.code(201).send(recording);
        }
        throw error;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      request.server.log.error({ 
        error: errorMessage, 
        stack: errorStack,
        userId,
        sessionId 
      }, '[RecordingController] Failed to create recording');
      return reply.code(500).send({ 
        message: 'Failed to create recording',
        error: errorMessage 
      });
    }
  }

  /**
   * Get recording by sessionId
   * GET /api/v1/recordings/:sessionId
   */
  static async getRecording(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const userId = (request.user as any).userId;
    const { sessionId } = request.params as { sessionId: string };

    try {
      const recording = await RecordingService.getRecording(userId, sessionId);
      return reply.send(recording);
    } catch (error) {
      if (error instanceof Error && error.message === 'Recording not found') {
        return reply.code(404).send({ message: 'Recording not found' });
      }
      request.server.log.error({ error }, '[RecordingController] Failed to get recording');
      return reply.code(500).send({ message: 'Failed to get recording' });
    }
  }

  /**
   * Get all recordings for user
   * GET /api/v1/recordings
   */
  static async getUserRecordings(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const userId = (request.user as any).userId;
    const { limit } = request.query as { limit?: number };

    try {
      const recordings = await RecordingService.getUserRecordings(userId, limit || 50);
      return reply.send(recordings);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      request.server.log.error({ 
        error: errorMessage, 
        stack: errorStack,
        userId 
      }, '[RecordingController] Failed to get recordings');
      return reply.code(500).send({ 
        message: 'Failed to get recordings',
        error: errorMessage 
      });
    }
  }

  /**
   * Delete a recording history entry by recording id
   * DELETE /api/v1/recordings/:recordingId
   *
   * This only removes the database record used for history display.
   * It does NOT delete audio files or analysis artifacts from S3.
   */
  static async deleteRecording(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const userId = (request.user as any).userId;
    const { recordingId } = request.params as { recordingId: string };

    if (!recordingId) {
      return reply.code(400).send({ message: 'recordingId is required' });
    }

    try {
      const result = await RecordingService.deleteRecordingById(
        userId,
        recordingId,
        request.server.log
      );
      return reply.send(result);
    } catch (error) {
      if (error instanceof Error && error.message === 'Recording not found') {
        return reply.code(404).send({ message: 'Recording not found' });
      }
      request.server.log.error({ error }, '[RecordingController] Failed to delete recording');
      return reply.code(500).send({ message: 'Failed to delete recording' });
    }
  }

  /**
   * Upload audio file
   * POST /api/v1/recordings/:sessionId/upload
   */
  static async uploadRecording(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const userId = (request.user as any).userId;
    const { sessionId } = request.params as { sessionId: string };

    try {
      // Get current recording to check status
      const recording = await RecordingService.getRecording(userId, sessionId);
      
      // Check if recording is in a valid state for upload
      if (recording.status === 'analyzing' || recording.status === 'completed') {
        return reply.code(400).send({ message: `Recording is currently ${recording.status}, cannot upload new audio` });
      }
      
      // Extract flight data and audio file from multipart form
      let audioBuffer: Buffer | null = null;
      let contentType = 'audio/mpeg';
      let flightDataJson: string | null = null;

      // Iterate over all parts in the multipart form
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'file') {
          // This is the audio file
          const file = part;
          const chunks: Buffer[] = [];
          for await (const chunk of file.file) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          audioBuffer = Buffer.concat(chunks);
          contentType = file.mimetype || 'audio/mpeg';
        } else if (part.type === 'field') {
          // This is a form field
          const field = part;
          const fieldName = field.fieldname;
          const fieldValue = field.value as string;

          if (fieldName === 'flightData') {
            // Compact flight data JSON
            flightDataJson = fieldValue;
          }
        }
      }

      if (!audioBuffer) {
        return reply.code(400).send({ message: 'No file uploaded' });
      }

      // Parse flight data if provided
      let flightData: CompactFlightData | undefined;
      if (flightDataJson) {
        try {
          flightData = JSON.parse(flightDataJson) as CompactFlightData;
          request.server.log.info({ 
            sampleCount: flightData.data?.length ?? 0,
            dataSize: flightDataJson.length 
          }, '[RecordingController] Received flight data');
        } catch (e) {
          request.server.log.warn({ error: e }, '[RecordingController] Failed to parse flight data JSON');
        }
      }

      request.server.log.info({ 
        userId, 
        sessionId, 
        size: audioBuffer.length, 
        hasFlightData: !!flightData,
        sampleCount: flightData?.data?.length ?? 0
      }, '[RecordingController] Uploading recording');

      // Update status to uploading
      await RecordingService.updateRecordingStatus(userId, sessionId, 'uploading', request.server.log);

      const result = await RecordingService.uploadRecording(
        {
          userId,
          sessionId,
          audioBuffer,
          contentType,
          flightData,
        },
        request.server.log
      );

      return reply.send(result);
    } catch (error) {
      request.server.log.error({ error }, '[RecordingController] Failed to upload recording');
      await RecordingService.updateRecordingStatus(userId, sessionId, 'failed', request.server.log).catch(() => {});
      return reply.code(500).send({ message: 'Failed to upload recording' });
    }
  }

  /**
   * Start analysis
   * POST /api/v1/recordings/:sessionId/analyze
   */
  static async startAnalysis(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const userId = (request.user as any).userId;
    const { sessionId } = request.params as { sessionId: string };
    const { vadType, vadParams, maxDurationMs } = request.body as {
      vadType?: string;
      vadParams?: Record<string, any>;
      maxDurationMs?: number;
    };

    try {
      const recording = await RecordingService.getRecording(userId, sessionId);

      if (!recording.audioS3Key) {
        return reply.code(400).send({ message: 'Recording must be uploaded before analysis' });
      }

      if (recording.status === 'analyzing' || recording.status === 'completed') {
        return reply.code(400).send({ message: `Analysis already ${recording.status}` });
      }

      if (!recording.flightDataS3Key) {
        return reply.code(400).send({ message: 'Flight data is required for analysis' });
      }

      const result = await RecordingService.startAnalysis(
        {
          userId,
          sessionId,
          audioS3Key: recording.audioS3Key,
          flightDataS3Key: recording.flightDataS3Key,
          vadType,
          vadParams,
          maxDurationMs,
        },
        request.server.log
      );

      return reply.send(result);
    } catch (error) {
      request.server.log.error({ error }, '[RecordingController] Failed to start analysis');
      return reply.code(500).send({ message: error instanceof Error ? error.message : 'Failed to start analysis' });
    }
  }

  /**
   * Check analysis status
   * GET /api/v1/recordings/:sessionId/status
   */
  static async getAnalysisStatus(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const userId = (request.user as any).userId;
    const { sessionId } = request.params as { sessionId: string };

    try {
      const status = await RecordingService.checkAnalysisStatus(
        userId,
        sessionId,
        request.server.log
      );
      return reply.send(status);
    } catch (error) {
      request.server.log.error({ error }, '[RecordingController] Failed to get analysis status');
      return reply.code(500).send({ message: 'Failed to get analysis status' });
    }
  }

  /**
   * Get report content
   * GET /api/v1/recordings/:sessionId/report
   */
  static async getReport(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const userId = (request.user as any).userId;
    const { sessionId } = request.params as { sessionId: string };

    try {
      const content = await RecordingService.getReportContent(
        userId,
        sessionId,
        request.server.log
      );
      return reply.type('text/markdown').send(content);
    } catch (error) {
      if (error instanceof Error && error.message === 'Report not available') {
        return reply.code(404).send({ message: 'Report not available' });
      }
      request.server.log.error({ error }, '[RecordingController] Failed to get report');
      return reply.code(500).send({ message: 'Failed to get report' });
    }
  }
}

