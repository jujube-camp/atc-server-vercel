import fs from 'fs/promises';
import path from 'path';
import type { FastifyBaseLogger } from 'fastify';
import { logger as defaultLogger } from '../utils/logger.js';

export class AudioService {
  /**
   * Save base64 audio data to file
   */
  static async saveAudioFile(
    base64Data: string, 
    fileName: string,
    logger: FastifyBaseLogger = defaultLogger
  ): Promise<string> {
    try {
      // Create audio directory if it doesn't exist
      const audioDir = path.join(process.cwd(), 'uploads', 'audio');
      await fs.mkdir(audioDir, { recursive: true });

      const filePath = path.join(audioDir, fileName);

      // Convert base64 to buffer and write to file
      const audioBuffer = Buffer.from(base64Data, 'base64');
      await fs.writeFile(filePath, audioBuffer);

      logger.info({ filePath }, 'Audio file saved');
      return filePath;
    } catch (error) {
      logger.error({ error }, 'Error saving audio file');
      return '';
    }
  }

  /**
   * Get audio file size from base64 data
   */
  static getAudioFileSize(base64Data: string): number {
    // Remove padding characters for accurate calculation
    const base64Length = base64Data.replace(/=/g, '').length;
    return Math.floor((base64Length * 3) / 4) / 1024 / 1024;
  }

  /**
   * Convert MIME type to audio format
   */
  static mimeTypeToFormat(mimeType: string, logger: FastifyBaseLogger = defaultLogger): string {
    logger.info({ mimeType }, 'Converting MIME type to format');
    const mimeToFormat: Record<string, string> = {
      'audio/wav': 'wav',
      'vnd.wave': 'wav',
      'audio/m4a': 'm4a',
      'audio/x-m4a': 'm4a',
    };
    if (!mimeToFormat[mimeType.toLowerCase()]) {
      logger.warn({ mimeType }, 'Unsupported MIME type');
      return '';
    }
    return mimeToFormat[mimeType.toLowerCase()];
  }
}
