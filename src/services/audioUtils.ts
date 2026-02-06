/**
 * Audio Utilities
 * Helper functions for audio format conversion and processing
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';

const execAsync = promisify(exec);

let ffmpegAvailable: boolean | null = null;

/**
 * Detect audio parameters from PCM buffer
 * Fish Audio returns 32-bit float PCM by default
 */
export function detectPCMFormat(buffer: Buffer): {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  duration: number;
} {
  // Fish Audio typically returns 32-bit float PCM at 44100 Hz mono
  // But the actual format may vary
  const possibleConfigs = [
    { sampleRate: 44100, channels: 1, bitsPerSample: 32 }, // Fish Audio default
    { sampleRate: 24000, channels: 1, bitsPerSample: 32 },
    { sampleRate: 24000, channels: 1, bitsPerSample: 16 },
    { sampleRate: 22050, channels: 1, bitsPerSample: 16 },
    { sampleRate: 16000, channels: 1, bitsPerSample: 16 },
  ];

  const bufferSize = buffer.length;
  console.log(`[AudioUtils] Detecting PCM format from buffer size: ${bufferSize} bytes`);

  for (const config of possibleConfigs) {
    const bytesPerSample = config.bitsPerSample / 8;
    const totalSamples = bufferSize / (bytesPerSample * config.channels);
    const duration = totalSamples / config.sampleRate;

    // Check if this makes sense (duration between 0.1s and 60s)
    if (duration > 0.1 && duration < 60 && Number.isInteger(totalSamples)) {
      console.log(`[AudioUtils] Detected format: ${config.sampleRate}Hz, ${config.channels}ch, ${config.bitsPerSample}bit, duration: ${duration.toFixed(2)}s`);
      return { ...config, duration };
    }
  }

  // Default fallback
  console.warn(`[AudioUtils] Could not detect format, using default: 44100Hz, 1ch, 32bit`);
  return { sampleRate: 44100, channels: 1, bitsPerSample: 32, duration: 0 };
}

/**
 * Convert 32-bit float PCM to 16-bit PCM
 */
function float32ToInt16(buffer: Buffer): Buffer {
  const floatArray = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);
  const int16Array = new Int16Array(floatArray.length);

  for (let i = 0; i < floatArray.length; i++) {
    // Clamp to [-1, 1] and convert to 16-bit int
    const clamped = Math.max(-1, Math.min(1, floatArray[i]));
    int16Array[i] = Math.round(clamped * 32767);
  }

  return Buffer.from(int16Array.buffer);
}

/**
 * Convert PCM buffer to WAV format
 * @param pcmBuffer - Raw PCM data (can be 16-bit or 32-bit float)
 * @param sampleRate - Sample rate (auto-detected if not provided)
 * @param numChannels - Number of channels (default: 1 for mono)
 * @param inputBitsPerSample - Input bits per sample (default: auto-detect)
 * @returns WAV buffer with proper headers
 */
export function pcmToWav(
  pcmBuffer: Buffer,
  sampleRate?: number,
  numChannels: number = 1,
  inputBitsPerSample?: number
): Buffer {
  console.log(`[AudioUtils] pcmToWav called with buffer size: ${pcmBuffer.length} bytes`);

  // Auto-detect format if not provided
  if (!sampleRate || !inputBitsPerSample) {
    const detected = detectPCMFormat(pcmBuffer);
    sampleRate = sampleRate || detected.sampleRate;
    inputBitsPerSample = inputBitsPerSample || detected.bitsPerSample;
  }

  console.log(`[AudioUtils] Using format: ${sampleRate}Hz, ${numChannels}ch, ${inputBitsPerSample}bit input`);

  // Convert 32-bit float to 16-bit if needed
  let convertedBuffer = pcmBuffer;
  if (inputBitsPerSample === 32) {
    console.log('[AudioUtils] Converting 32-bit float PCM to 16-bit PCM...');
    convertedBuffer = float32ToInt16(pcmBuffer);
    console.log(`[AudioUtils] Converted buffer size: ${convertedBuffer.length} bytes`);
  }

  const bitsPerSample = 16; // Always output 16-bit WAV
  const blockAlign = numChannels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const dataSize = convertedBuffer.length;

  // WAV file header (44 bytes)
  const header = Buffer.alloc(44);

  // RIFF chunk descriptor
  header.write('RIFF', 0); // ChunkID
  header.writeUInt32LE(36 + dataSize, 4); // ChunkSize
  header.write('WAVE', 8); // Format

  // fmt sub-chunk
  header.write('fmt ', 12); // Subchunk1ID
  header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  header.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
  header.writeUInt16LE(numChannels, 22); // NumChannels
  header.writeUInt32LE(sampleRate, 24); // SampleRate
  header.writeUInt32LE(byteRate, 28); // ByteRate
  header.writeUInt16LE(blockAlign, 32); // BlockAlign
  header.writeUInt16LE(bitsPerSample, 34); // BitsPerSample

  // data sub-chunk
  header.write('data', 36); // Subchunk2ID
  header.writeUInt32LE(dataSize, 40); // Subchunk2Size

  // Concatenate header and converted PCM data
  const result = Buffer.concat([header, convertedBuffer]);
  console.log(`[AudioUtils] Final WAV buffer size: ${result.length} bytes (${convertedBuffer.length} data + 44 header)`);
  return result;
}

/**
 * Get content type for audio format
 */
export function getAudioContentType(format: string): string {
  switch (format) {
    case 'wav':
      return 'audio/wav';
    case 'mp3':
      return 'audio/mpeg';
    case 'opus':
      return 'audio/opus';
    case 'pcm':
      return 'audio/wav'; // PCM wrapped in WAV
    default:
      return 'application/octet-stream';
  }
}

// ============================================================================
// FFmpeg-based Audio Conversion
// ============================================================================

/**
 * Check if ffmpeg is available
 */
async function checkFFmpeg(): Promise<boolean> {
  if (ffmpegAvailable !== null) {
    return ffmpegAvailable;
  }

  try {
    await execAsync('ffmpeg -version');
    console.log('[AudioUtils] ffmpeg is available');
    ffmpegAvailable = true;
    return true;
  } catch {
    console.warn('[AudioUtils] ffmpeg is not available');
    ffmpegAvailable = false;
    return false;
  }
}

/**
 * Convert WAV buffer to MP3 buffer using ffmpeg
 * @param wavBuffer - Input WAV buffer
 * @returns MP3 buffer
 */
export async function wavToMp3(wavBuffer: Buffer): Promise<Buffer> {
  const hasFFmpeg = await checkFFmpeg();
  if (!hasFFmpeg) {
    throw new Error('ffmpeg is not available');
  }

  const tempId = randomBytes(8).toString('hex');
  const inputFile = join(tmpdir(), `input_${tempId}.wav`);
  const outputFile = join(tmpdir(), `output_${tempId}.mp3`);

  try {
    console.log(`[AudioUtils] Converting WAV to MP3, input size: ${wavBuffer.length} bytes`);

    await writeFile(inputFile, wavBuffer);
    await execAsync(
      `ffmpeg -i "${inputFile}" -acodec libmp3lame -b:a 128k "${outputFile}" -y 2>/dev/null`
    );

    const mp3Buffer = await readFile(outputFile);
    console.log(`[AudioUtils] Conversion complete, output size: ${mp3Buffer.length} bytes`);

    await unlink(inputFile).catch(() => {});
    await unlink(outputFile).catch(() => {});

    return mp3Buffer;
  } catch (error) {
    console.error('[AudioUtils] WAV to MP3 conversion failed:', error);

    await unlink(inputFile).catch(() => {});
    await unlink(outputFile).catch(() => {});

    throw error;
  }
}

/**
 * Check if ffmpeg is available (public method)
 */
export async function isFFmpegAvailable(): Promise<boolean> {
  return checkFFmpeg();
}
