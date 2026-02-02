import { S3Client, PutObjectCommand, PutObjectCommandInput, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env.js';
import type { FastifyBaseLogger } from 'fastify';
import { logger as defaultLogger } from '../utils/logger.js';
import { Readable } from 'stream';

export class S3Service {
  private static client: S3Client | null = null;

  /**
   * Get or create S3 client instance
   */
  private static getClient(): S3Client {
    if (!this.client) {
      const config: any = {
        region: env.AWS_REGION || 'us-west-2',
      };

      // Support for local S3-compatible services (like LocalStack)
      if (env.AWS_S3_FORCE_PATH_STYLE === 'true') {
        config.forcePathStyle = true;
      }

      this.client = new S3Client(config);
    }
    return this.client;
  }

  /**
   * Check if S3 is configured
   */
  static isConfigured(): boolean {
    return !!(env.AWS_S3_AUDIO_BUCKET && env.AWS_REGION);
  }

  private static getFullKey(key: string): { bucket: string; fullKey: string } {
    const bucket = env.AWS_S3_AUDIO_BUCKET!;
    let fullKey: string;
    
    // For analyze functionality, use the configured analysis prefix
    if (key.startsWith('analyze/')) {
      // Remove the default 'analyze/' prefix and use the configured one
      const relativeKey = key.replace('analyze/', '');
      const analysisPrefix = env.AWS_S3_ANALYSIS_PREFIX;
      fullKey = `${analysisPrefix}/${relativeKey}`;
    } else {
      const prefix = env.AWS_S3_AUDIO_PREFIX || 'cockpit/audio';
      fullKey = `${prefix}/${key}`;
    }
    
    return { bucket, fullKey };
  }

  /**
   * Upload audio buffer to S3
   * @param buffer - Audio data buffer
   * @param key - S3 object key (path)
   * @param contentType - MIME type of the audio
   * @param logger - Logger instance
   * @returns Relative file path (not full URL)
   */
  static async uploadAudio(
    buffer: Buffer,
    key: string,
    contentType: string,
    logger: FastifyBaseLogger = defaultLogger
  ): Promise<string> {
    if (!this.isConfigured()) {
      logger.warn('[S3Service] S3 not configured, skipping upload');
      return '';
    }

    try {
      const client = this.getClient();
      const { bucket, fullKey } = this.getFullKey(key);

      const params: PutObjectCommandInput = {
        Bucket: bucket,
        Key: fullKey,
        Body: buffer,
        ContentType: contentType,
        // Make files publicly readable if needed, or use signed URLs
        // ACL: 'public-read', // Uncomment if you want public access
      };

      const command = new PutObjectCommand(params);
      await client.send(command);

      // Return only the relative path (filename)
      // Frontend will construct CloudFront URL
      return key;
    } catch (error) {
      logger.error({ error, key }, '[S3Service] Failed to upload audio to S3');
      throw error;
    }
  }

  /**
   * Delete a single audio object from S3
   */
  static async deleteAudio(
    key: string,
    logger: FastifyBaseLogger = defaultLogger
  ): Promise<void> {
    if (!key || !this.isConfigured()) {
      return;
    }

    try {
      const client = this.getClient();
      const { bucket, fullKey } = this.getFullKey(key);
      const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: fullKey,
      });
      await client.send(command);
      logger.info({ key: fullKey }, '[S3Service] Audio deleted from S3');
    } catch (error) {
      logger.error({ error, key }, '[S3Service] Failed to delete audio from S3');
    }
  }

  /**
   * Delete multiple audio objects from S3
   */
  static async deleteAudioBatch(
    keys: string[],
    logger: FastifyBaseLogger = defaultLogger
  ): Promise<void> {
    if (!Array.isArray(keys) || keys.length === 0) {
      return;
    }

    await Promise.all(keys.map((key) => this.deleteAudio(key, logger)));
  }

  /**
   * Upload audio from a Readable stream to S3
   * @param stream - Readable stream containing audio data
   * @param key - S3 object key (path)
   * @param contentType - MIME type of the audio
   * @param logger - Logger instance
   * @returns S3 URL of the uploaded file
   */
  static async uploadAudioStream(
    stream: Readable,
    key: string,
    contentType: string,
    logger: FastifyBaseLogger = defaultLogger
  ): Promise<string> {
    // Convert stream to buffer
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    return this.uploadAudio(buffer, key, contentType, logger);
  }

  /**
   * Generate a unique key for audio files
   * @param sessionId - Session ID
   * @param type - Type of audio ('user' or 'atc')
   * @param format - Audio format extension (e.g., 'mp3', 'wav', 'm4a')
   * @param transmissionId - Optional transmission ID for more specific naming
   * @returns Unique S3 key (relative path)
   */
  static generateAudioKey(
    sessionId: string,
    type: 'user' | 'atc',
    format: string,
    transmissionId?: string
  ): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    
    // If transmissionId is provided, use it for more specific naming
    if (transmissionId) {
      return `${sessionId}/${type}-${transmissionId}.${format}`;
    }
    
    return `${sessionId}/${type}-${timestamp}-${random}.${format}`;
  }

  /**
   * Get content type from audio format
   * @param format - Audio format (e.g., 'mp3', 'wav', 'm4a')
   * @returns MIME type
   */
  static getContentType(format: string): string {
    const contentTypeMap: Record<string, string> = {
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      m4a: 'audio/mp4',
      'x-m4a': 'audio/mp4',
      opus: 'audio/opus',
      pcm: 'audio/pcm',
    };
    return contentTypeMap[format.toLowerCase()] || 'audio/mpeg';
  }

  /**
   * Extract format from MIME type
   * @param mimeType - MIME type (e.g., 'audio/mpeg')
   * @returns File extension
   */
  static getFormatFromMimeType(mimeType: string): string {
    const formatMap: Record<string, string> = {
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'audio/mp4': 'm4a',
      'audio/x-m4a': 'm4a',
      'audio/opus': 'opus',
      'audio/pcm': 'pcm',
      'vnd.wave': 'wav',
    };
    
    const normalizedMime = mimeType.toLowerCase().replace('audio/', '');
    return formatMap[mimeType.toLowerCase()] || formatMap[normalizedMime] || 'mp3';
  }
}

