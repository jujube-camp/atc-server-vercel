import { prisma } from '../utils/prisma.js';
import type { FastifyBaseLogger } from 'fastify';
import { S3Service } from './s3Service.js';
import { env } from '../config/env.js';
import { logger as defaultLogger } from '../utils/logger.js';
import { MembershipService } from './membershipService.js';

export interface CreateRecordingData {
  userId: string;
  sessionId: string;
}

/**
 * Compact flight data format for efficient storage and transfer.
 * Uses columnar format with short column names to minimize bandwidth.
 * Columns: t,lat,lng,spd,alt,hdg,ax,ay,az,g,mh,pa,ap
 * 
 * The 't' column stores relative timestamp (ms from startTime) for each sample.
 * To get absolute timestamp: startTime + data[i][0]
 * Samples may have irregular intervals due to GPS timing or app backgrounding.
 */
export interface CompactFlightData {
  version: 1;
  sampleRateMs: number; // Target sample rate in milliseconds (actual may vary)
  startTime: number; // Unix timestamp (ms) of first sample
  columns: string[]; // Column names
  data: (number | null)[][]; // Array of sample rows
}

export interface UploadRecordingData {
  userId: string;
  sessionId: string;
  audioBuffer: Buffer;
  contentType: string;
  flightData?: CompactFlightData;
}

export interface StartAnalysisData {
  userId: string;
  sessionId: string;
  audioS3Key: string;
  flightDataS3Key: string;
  vadType?: string;
  vadParams?: Record<string, any>;
  maxDurationMs?: number;
}

export class RecordingService {
  /**
   * Create a new recording record or return existing one
   */
  static async createRecording(
    data: CreateRecordingData,
    logger: FastifyBaseLogger = defaultLogger
  ) {
    logger.info({ userId: data.userId, sessionId: data.sessionId }, '[RecordingService] Creating or getting recording');

    // Validate userId exists
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true },
    });

    if (!user) {
      const errorMessage = `User with id ${data.userId} does not exist`;
      logger.error({ 
        error: errorMessage, 
        userId: data.userId, 
        sessionId: data.sessionId 
      }, '[RecordingService] User not found');
      throw new Error(`Failed to create recording: ${errorMessage}`);
    }

    // Validate Prisma client has Recording model
    if (!prisma.recording) {
      const errorMessage = 'Prisma client not properly generated. Please run: pnpm prisma:generate';
      logger.error({ 
        error: errorMessage, 
        userId: data.userId, 
        sessionId: data.sessionId 
      }, '[RecordingService] Prisma client missing Recording model');
      throw new Error(`Failed to create recording: ${errorMessage}`);
    }

    // First check if recording exists
    let recording = await prisma.recording.findFirst({
      where: {
        userId: data.userId,
        sessionId: data.sessionId,
      },
    });

    // If recording doesn't exist, create a new one
    if (!recording) {
      try {
        recording = await prisma.recording.create({
          data: {
            userId: data.userId,
            sessionId: data.sessionId,
            status: 'idle',
            updatedAt: new Date(), // Explicitly set updatedAt
          },
        });
        logger.info({ userId: data.userId, sessionId: data.sessionId, recordingId: recording.id }, '[RecordingService] Recording created successfully');
      } catch (createError: any) {
        // Handle Prisma-specific errors
        let errorMessage: string;
        
        if (createError?.code === 'P2002') {
          // Unique constraint violation
          errorMessage = `Recording with sessionId ${data.sessionId} already exists`;
        } else if (createError?.code === 'P2003') {
          // Foreign key constraint violation
          errorMessage = `Invalid userId: ${data.userId} does not exist`;
        } else if (createError instanceof Error) {
          errorMessage = createError.message;
        } else {
          errorMessage = String(createError);
        }

        logger.error({ 
          error: errorMessage,
          errorCode: createError?.code,
          errorMeta: createError?.meta,
          userId: data.userId, 
          sessionId: data.sessionId 
        }, '[RecordingService] Failed to create recording in database');
        throw new Error(`Failed to create recording: ${errorMessage}`);
      }
    }

    return recording;
  }

  /**
   * Get recording by sessionId (must belong to user)
   */
  static async getRecording(userId: string, sessionId: string) {
    if (!prisma.recording) {
      throw new Error('Prisma client not properly generated. Please run: pnpm prisma:generate');
    }
    
    const recording = await prisma.recording.findFirst({
      where: {
        sessionId,
        userId,
      },
    });

    if (!recording) {
      throw new Error('Recording not found');
    }

    return recording;
  }

  /**
   * Get all recordings for a user
   */
  static async getUserRecordings(userId: string, limit: number = 50) {
    try {
      const recordings = await prisma.recording.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      return recordings;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      defaultLogger.error({ 
        error: errorMessage, 
        userId 
      }, '[RecordingService] Failed to get user recordings from database');
      throw new Error(`Failed to get recordings: ${errorMessage}`);
    }
  }

  /**
   * Delete a recording history entry by its recording id.
   *
   * This only removes the database record (used for history display).
   * It does NOT delete any audio or analysis artifacts from S3.
   */
  static async deleteRecordingById(
    userId: string,
    recordingId: string,
    logger: FastifyBaseLogger = defaultLogger
  ) {
    logger.info({ userId, recordingId }, '[RecordingService] Deleting recording history entry');

    // Ensure the recording belongs to the user before deleting
    const result = await prisma.recording.deleteMany({
      where: {
        id: recordingId,
        userId,
      },
    });

    if (result.count === 0) {
      // Nothing deleted – either not found or does not belong to user
      throw new Error('Recording not found');
    }

    return { success: true };
  }

  /**
   * Update recording status
   */
  static async updateRecordingStatus(
    userId: string,
    sessionId: string,
    status: string,
    logger: FastifyBaseLogger = defaultLogger
  ) {
    logger.info({ userId, sessionId, status }, '[RecordingService] Updating recording status');

    return await prisma.recording.updateMany({
      where: {
        sessionId,
        userId,
      },
      data: {
        status,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Upload audio file and flight data to S3, update recording
   */
  static async uploadRecording(
    data: UploadRecordingData,
    logger: FastifyBaseLogger = defaultLogger
  ) {
    const { userId, sessionId, audioBuffer, contentType, flightData } = data;

    // No limit check on upload - users can upload unlimited recordings
    // Limit is checked on analysis instead

    logger.info({ 
      userId, 
      sessionId, 
      hasFlightData: !!flightData,
      sampleCount: flightData?.data?.length ?? 0
    }, '[RecordingService] Uploading recording to S3');

    // Generate S3 keys
    const audioS3Key = `analyze/${userId}/${sessionId}/recording/flight_audio.mp3`;
    const flightDataS3Key = `analyze/${userId}/${sessionId}/recording/flight_data.json`;

    // Upload audio to S3
    const uploadedAudioKey = await S3Service.uploadAudio(
      audioBuffer,
      audioS3Key,
      contentType,
      logger
    );

    // Upload flight data to S3 if available
    let uploadedFlightDataKey: string | null = null;
    if (flightData && flightData.data.length > 0) {
      const flightDataBuffer = Buffer.from(JSON.stringify(flightData), 'utf-8');
      uploadedFlightDataKey = await S3Service.uploadAudio(
        flightDataBuffer,
        flightDataS3Key,
        'application/json',
        logger
      );
      logger.info({ 
        sampleCount: flightData.data.length,
        dataSize: flightDataBuffer.length,
        s3Key: uploadedFlightDataKey 
      }, '[RecordingService] Flight data uploaded to S3');
    }

    // Generate CloudFront URLs if base URL is configured
    const audioUrl = env.AWS_S3_AUDIO_BASE_URL
      ? `${env.AWS_S3_AUDIO_BASE_URL}/${uploadedAudioKey}`
      : null;
    const flightDataUrl = uploadedFlightDataKey && env.AWS_S3_AUDIO_BASE_URL
      ? `${env.AWS_S3_AUDIO_BASE_URL}/${uploadedFlightDataKey}`
      : null;

    // Prepare update data
    const updateData: any = {
      audioS3Key: uploadedAudioKey,
      audioUrl,
      status: 'uploaded',
      updatedAt: new Date(),
    };

    // Add flight data S3 keys if available
    if (flightData && flightData.data.length > 0) {
      updateData.flightDataS3Key = uploadedFlightDataKey;
      updateData.flightDataUrl = flightDataUrl;
    }

    // Update recording
    await prisma.recording.updateMany({
      where: {
        sessionId,
        userId,
      },
      data: updateData,
    });

    // No usage recording here - usage is recorded when analysis starts, not on upload

    logger.info({ 
      userId, 
      sessionId, 
      audioS3Key: uploadedAudioKey, 
      flightDataS3Key: uploadedFlightDataKey,
      sampleCount: flightData?.data?.length ?? 0
    }, '[RecordingService] Recording uploaded successfully');

    return {
      s3Key: uploadedAudioKey,
      audioUrl,
      flightDataS3Key: uploadedFlightDataKey,
      flightDataUrl,
    };
  }

  /**
   * Start analysis job via audio processor API
   */
  static async startAnalysis(
    data: StartAnalysisData,
    logger: FastifyBaseLogger = defaultLogger
  ) {
    const { userId, sessionId, audioS3Key, flightDataS3Key, vadType = 'silero', vadParams, maxDurationMs } = data;

    // Pre-check limits (non-atomic) to avoid unnecessary API calls
    // This is just an optimization - the atomic check happens after the API call succeeds
    const limits = await MembershipService.getUsageLimits(userId, logger);
    if (limits.maxRecordingAnalyses !== null && limits.recordingAnalysesUsed >= limits.maxRecordingAnalyses) {
      const reason = limits.maxRecordingAnalyses === 1
        ? 'You have reached the free tier limit of 1 recording analysis. Please upgrade to Premium for unlimited analysis.'
        : `You have reached your limit of ${limits.maxRecordingAnalyses} recording analyses.`;
      throw new Error(reason);
    }

    // Check environment configuration BEFORE consuming quota
    if (!env.AUDIO_PROCESSOR_API_URL) {
      const errorMessage = 'AUDIO_PROCESSOR_API_URL is not configured. This environment variable is required for audio analysis. Please set it to the URL of your audio processor API service (e.g., http://localhost:8081). The service should expose endpoints at /api/aviate-training/jobs for processing audio recordings.';
      logger.error({ userId, sessionId }, '[RecordingService] ' + errorMessage);
      throw new Error(errorMessage);
    }

    logger.info({ userId, sessionId, audioS3Key }, '[RecordingService] Starting analysis job');

    // Construct S3 URI
    const bucket = env.AWS_S3_AUDIO_BUCKET || 'aviate-ai-public';
    const audioUri = `s3://${bucket}/${audioS3Key}`;
    const flightDataUri = `s3://${bucket}/${flightDataS3Key}`;

    const requestBody: any = {
      audio_uri: audioUri,
      session_id: sessionId,
      user_id: userId,
      vad_type: vadType,
      vad_params: vadParams,
      max_duration_ms: maxDurationMs,
      flight_data_uri: flightDataUri,
    };

    // Call audio processor API BEFORE recording usage
    // This ensures quota is only consumed if the analysis job is successfully created
    const apiUrl = env.AUDIO_PROCESSOR_API_URL;
    const response = await fetch(`${apiUrl}/api/aviate-training/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ userId, sessionId, status: response.status, error: errorText }, '[RecordingService] Failed to create analysis job');
      throw new Error(`Failed to create analysis job: ${response.status} ${errorText}`);
    }

    const jobResponse = await response.json() as { job_id: string };
    const jobId = jobResponse.job_id;

    // Only after the API call succeeds, atomically check limits and record usage
    // This prevents TOCTOU race conditions where concurrent requests could both
    // pass the limit check before either increments the counter
    const result = await MembershipService.tryRecordUsageForAnalysis(userId, logger);
    if (!result.allowed) {
      // This should be extremely rare - it means another request consumed the quota between
      // our pre-check and now. We've already created the job, so we must attempt to cancel it
      // to prevent orphaned jobs consuming resources on the audio processor API.
      logger.error({ userId, sessionId, jobId, reason: result.reason }, '[RecordingService] Usage recording failed after job creation - quota exhausted by concurrent request. Attempting to cancel orphaned job.');
      
      // Attempt to cancel the job to prevent resource waste
      // Note: This will gracefully fail if the audio processor API doesn't support job cancellation
      try {
        await RecordingService.cancelAnalysisJob(jobId, logger);
        logger.info({ userId, sessionId, jobId }, '[RecordingService] Successfully cancelled orphaned job');
      } catch (cancelError) {
        // Log but don't throw - the quota error is the primary concern
        logger.warn({ 
          userId, 
          sessionId, 
          jobId, 
          cancelError: cancelError instanceof Error ? cancelError.message : String(cancelError) 
        }, '[RecordingService] Failed to cancel orphaned job - job may remain in system. Consider implementing DELETE endpoint on audio processor API.');
      }
      
      throw new Error(result.reason || 'Cannot start analysis: quota limit reached');
    }

    // Update recording with job ID and status
    await prisma.recording.updateMany({
      where: {
        sessionId,
        userId,
      },
      data: {
        jobId,
        status: 'analyzing',
        updatedAt: new Date(),
      },
    });

    logger.info({ userId, sessionId, jobId }, '[RecordingService] Analysis job created');

    return {
      jobId,
    };
  }

  /**
   * Cancel an analysis job on the audio processor API
   * This is used to clean up orphaned jobs when quota checks fail after job creation.
   * 
   * Note: This will fail gracefully if the audio processor API doesn't support
   * job cancellation (DELETE endpoint not implemented). The error is caught
   * and logged but not thrown to allow the calling code to handle the primary error.
   */
  private static async cancelAnalysisJob(
    jobId: string,
    logger: FastifyBaseLogger = defaultLogger
  ): Promise<void> {
    if (!env.AUDIO_PROCESSOR_API_URL) {
      throw new Error('AUDIO_PROCESSOR_API_URL is not configured');
    }

    const apiUrl = env.AUDIO_PROCESSOR_API_URL;
    const response = await fetch(`${apiUrl}/api/aviate-training/jobs/${jobId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      // If the endpoint doesn't exist (404) or isn't implemented (405), that's expected
      // and we'll log it as a warning. Other errors are more concerning.
      if (response.status === 404 || response.status === 405) {
        throw new Error(`Job cancellation endpoint not available (${response.status}). Audio processor API may need DELETE /api/aviate-training/jobs/{job_id} endpoint.`);
      }
      
      const errorText = await response.text();
      throw new Error(`Failed to cancel job: ${response.status} ${errorText}`);
    }

    logger.info({ jobId }, '[RecordingService] Successfully cancelled analysis job');
  }

  /**
   * Check analysis job status
   */
  static async checkAnalysisStatus(
    userId: string,
    sessionId: string,
    logger: FastifyBaseLogger = defaultLogger
  ) {
    const recording = await this.getRecording(userId, sessionId);

    if (!recording.jobId) {
      return {
        status: recording.status,
        jobId: null,
      };
    }

    if (!env.AUDIO_PROCESSOR_API_URL) {
      const errorMessage = 'AUDIO_PROCESSOR_API_URL is not configured. Please set this environment variable to the URL of the audio processor API service';
      logger.error({ userId, sessionId }, '[RecordingService] ' + errorMessage);
      throw new Error(errorMessage);
    }

    // Query audio processor API for job status
    const apiUrl = env.AUDIO_PROCESSOR_API_URL;
    const response = await fetch(`${apiUrl}/api/aviate-training/jobs/${recording.jobId}`, {
      method: 'GET',
    });

    if (!response.ok) {
      logger.warn({ userId, sessionId, jobId: recording.jobId, status: response.status }, '[RecordingService] Failed to get job status');
      return {
        status: recording.status,
        jobId: recording.jobId,
      };
    }

    const jobStatus = await response.json() as {
      status: 'completed' | 'failed' | 'running' | 'pending';
      progress?: number;
      error?: string;
      report_s3_uri?: string;
      summary_s3_uri?: string;
      timeline_s3_uri?: string;
    };

    // Update recording status based on job status
    let newStatus = recording.status;
    let reportS3Key = recording.reportS3Key;
    let reportUrl = recording.reportUrl;
    let summaryS3Key = recording.summaryS3Key;
    let summaryUrl = recording.summaryUrl;
    let timelineS3Key = recording.timelineS3Key;
    let timelineUrl = recording.timelineUrl;
    let errorMessage = recording.errorMessage;

    const bucket = env.AWS_S3_AUDIO_BUCKET || 'aviate-ai-public';

    if (jobStatus.status === 'completed') {
      newStatus = 'completed';
      // Extract S3 keys from URIs and generate CloudFront URLs
      if (jobStatus.report_s3_uri) {
        reportS3Key = jobStatus.report_s3_uri.replace(`s3://${bucket}/`, '');
        reportUrl = env.AWS_S3_AUDIO_BASE_URL
          ? `${env.AWS_S3_AUDIO_BASE_URL}/${reportS3Key}`
          : null;
        logger.info({ userId, sessionId, reportS3Key, reportUrl }, '[RecordingService] Extracted report S3 key from job status');
      }
      if (jobStatus.summary_s3_uri) {
        summaryS3Key = jobStatus.summary_s3_uri.replace(`s3://${bucket}/`, '');
        summaryUrl = env.AWS_S3_AUDIO_BASE_URL
          ? `${env.AWS_S3_AUDIO_BASE_URL}/${summaryS3Key}`
          : null;
      }
      if (jobStatus.timeline_s3_uri) {
        timelineS3Key = jobStatus.timeline_s3_uri.replace(`s3://${bucket}/`, '');
        timelineUrl = env.AWS_S3_AUDIO_BASE_URL
          ? `${env.AWS_S3_AUDIO_BASE_URL}/${timelineS3Key}`
          : null;
      }
    } else if (jobStatus.status === 'failed') {
      newStatus = 'failed';
      errorMessage = jobStatus.error || 'Analysis failed';
    } else if (jobStatus.status === 'running') {
      newStatus = 'analyzing';
    }

    // Update recording if status changed OR if report keys are now available
    const hasNewReportData = (jobStatus.status === 'completed' && 
      (jobStatus.report_s3_uri || jobStatus.summary_s3_uri || jobStatus.timeline_s3_uri) &&
      (!recording.reportS3Key || !recording.summaryS3Key || !recording.timelineS3Key));

    if (newStatus !== recording.status || hasNewReportData) {
      const updateData: any = {
        status: newStatus,
        errorMessage,
        updatedAt: new Date(),
      };

      // Always update report keys if they are available from job status
      if (reportS3Key) {
        updateData.reportS3Key = reportS3Key;
        logger.info({ userId, sessionId, reportS3Key }, '[RecordingService] Updating reportS3Key in database');
      }
      if (reportUrl) updateData.reportUrl = reportUrl;
      if (summaryS3Key) updateData.summaryS3Key = summaryS3Key;
      if (summaryUrl) updateData.summaryUrl = summaryUrl;
      if (timelineS3Key) updateData.timelineS3Key = timelineS3Key;
      if (timelineUrl) updateData.timelineUrl = timelineUrl;

      await prisma.recording.updateMany({
        where: {
          sessionId,
          userId,
        },
        data: updateData,
      });
      
      logger.info({ userId, sessionId, newStatus, hasReport: !!reportS3Key }, '[RecordingService] Recording status updated');
    }

    return {
      status: newStatus,
      jobId: recording.jobId,
      progress: jobStatus.progress,
      error: errorMessage,
      reportUrl,
      summaryUrl,
      timelineUrl,
    };
  }

  /**
   * Get report content from S3
   */
  static async getReportContent(
    userId: string,
    sessionId: string,
    logger: FastifyBaseLogger = defaultLogger
  ) {
    const recording = await this.getRecording(userId, sessionId);

    // If reportS3Key is not set, try to get it from job status
    let reportS3Key = recording.reportS3Key;
    
    if (!reportS3Key && recording.jobId) {
      logger.info({ userId, sessionId, jobId: recording.jobId }, '[RecordingService] Report key not found, checking job status');
      
      // Re-check status to get report key
      const statusData = await this.checkAnalysisStatus(userId, sessionId, logger);
      if (statusData.reportUrl) {
        // Re-fetch recording to get updated reportS3Key
        const updatedRecording = await this.getRecording(userId, sessionId);
        reportS3Key = updatedRecording.reportS3Key;
      }
    }

    if (!reportS3Key) {
      throw new Error('Report not available. Analysis may still be in progress.');
    }

    // Download from S3
    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({
      region: env.AWS_REGION || 'us-west-2',
    });

    const bucket = env.AWS_S3_AUDIO_BUCKET!;
    
    // The reportS3Key should be the full path without bucket prefix
    // It should already be in the format: analyze/.../analysis/report.md
    const s3Key = reportS3Key;

    logger.info({ userId, sessionId, s3Key, bucket }, '[RecordingService] Downloading report from S3');
    
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: s3Key,
    });

    try {
      const response = await client.send(command);
      const content = await response.Body?.transformToString();

      if (!content) {
        throw new Error('Failed to read report content');
      }

      logger.info({ userId, sessionId }, '[RecordingService] Report downloaded successfully');
      return content;
    } catch (error) {
      logger.error({ error, s3Key, bucket }, '[RecordingService] Failed to download report from S3');
      throw new Error(`Failed to download report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

