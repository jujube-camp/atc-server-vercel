import { FishAudioClient } from 'fish-audio';
import { Readable } from 'stream';
import { ProxyAgent } from 'undici';
import { env } from '../config/env.js';
import {
  applyRadioEffects,
  RadioEffectsConfig,
  STANDARD_RADIO_CONFIG,
  LIGHT_RADIO_CONFIG,
  HEAVY_RADIO_CONFIG,
  CLEAR_CONFIG,
} from './radioEffects.js';
import { wavToMp3, isFFmpegAvailable } from './audioUtils.js';

const FISH_AUDIO_HOST = 'fish.audio';

let fishAudioProxyConfigured = false;

function resolveRequestUrl(input: Parameters<typeof fetch>[0]): string | null {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  if (typeof Request !== 'undefined' && input instanceof Request) {
    return input.url;
  }
  return null;
}

function configureFishAudioProxy(): void {
  if (fishAudioProxyConfigured) {
    return;
  }

  const resolvedProxy =
    env.HTTPS_PROXY ||
    env.HTTP_PROXY ||
    env.PROXY;

  if (!resolvedProxy || typeof fetch !== 'function') {
    fishAudioProxyConfigured = true;
    return;
  }

  const originalFetch = globalThis.fetch?.bind(globalThis);

  if (!originalFetch) {
    fishAudioProxyConfigured = true;
    return;
  }

  const proxyAgent = new ProxyAgent(resolvedProxy);

  globalThis.fetch = (async (input, init) => {
    const targetUrl = resolveRequestUrl(input);
    if (targetUrl?.includes(FISH_AUDIO_HOST)) {
      const proxiedInit: RequestInit = {
        ...init,
        dispatcher: proxyAgent,
      };
      return originalFetch(input, proxiedInit);
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  fishAudioProxyConfigured = true;
}

export interface FishAudioTTSOptions {
  text: string;
  format?: 'wav' | 'pcm' | 'mp3' | 'opus';
  reference_id?: string;
  chunk_length?: number;
  normalize?: boolean;
  latency?: 'normal' | 'balanced';
  /**
   * Radio effects: 'standard' | 'light' | 'heavy' | 'clear' | RadioEffectsConfig
   * Default: 'standard' (standard ATC radio effect, WAV format)
   * See radioEffects.ts for detailed configuration
   */
  radioEffects?: 'standard' | 'light' | 'heavy' | 'clear' | RadioEffectsConfig;
}

export class FishAudioService {
  private static client: FishAudioClient | null = null;
  private static apiKey: string | null = null;

  private static getClient(apiKey: string): FishAudioClient {
    configureFishAudioProxy();

    if (!this.client || this.apiKey !== apiKey) {
      this.apiKey = apiKey;
      this.client = new FishAudioClient({
        apiKey: apiKey,
      });
    }
    return this.client;
  }

  /**
   * Generate audio response from text using Fish Audio TTS HTTP API
   * @param options - TTS options (format defaults to 'mp3', radioEffects defaults to 'standard')
   * @returns Audio stream with radio effects applied
   */
  static async generateAudio(
    options: FishAudioTTSOptions
  ): Promise<Readable> {
    const result = await this.generateAudioWithBuffer(options);
    return result.stream;
  }

  /**
   * Generate audio response and return both buffer and stream
   * @param options - TTS options (format defaults to 'mp3', radioEffects defaults to 'standard')
   * @returns Audio buffer and stream with radio effects applied
   */
  static async generateAudioWithBuffer(
    options: FishAudioTTSOptions
  ): Promise<{ buffer: Buffer; stream: Readable; format: string }> {
    const { text, format = 'mp3', reference_id, radioEffects = 'light', ...restOptions } = options;

    if (!this.apiKey) {
      throw new Error('FISH_AUDIO_API_KEY is not configured');
    }

    const client = this.getClient(this.apiKey);

    // If radio effects are requested and format is MP3, we need to:
    // 1. Get WAV from Fish Audio (for processing)
    // 2. Apply radio effects
    // 3. Convert back to MP3
    const shouldApplyEffects = radioEffects && radioEffects !== 'clear';
    const requestFormat = shouldApplyEffects ? 'wav' : format;

    console.log(`[FishAudioService] Requesting format: ${requestFormat} (output: ${format}, effects: ${shouldApplyEffects})`);

    const audioIterable = await client.textToSpeech.convert({
      text,
      format: requestFormat,
      reference_id: reference_id || env.FISH_AUDIO_REFERENCE_ID,
      ...restOptions,
    });

    const chunks: Buffer[] = [];
    for await (const chunk of audioIterable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    let audioBuffer = Buffer.concat(chunks);
    console.log(`[FishAudioService] Received ${audioBuffer.length} bytes from Fish Audio (format: ${requestFormat})`);

    // Apply radio effects if configured
    if (shouldApplyEffects) {
      console.log('[FishAudioService] Applying radio effects...');
      const processedBuffer = await this.applyRadioEffectsIfNeeded(audioBuffer, radioEffects, 'wav');

      // If output format is MP3, convert WAV to MP3
      if (format === 'mp3') {
        const hasFFmpeg = await isFFmpegAvailable();
        if (hasFFmpeg) {
          console.log('[FishAudioService] Converting WAV to MP3...');
          try {
            const mp3Buffer = await wavToMp3(processedBuffer);
            console.log(`[FishAudioService] Returning MP3 with radio effects, size: ${mp3Buffer.length} bytes`);
            return {
              buffer: mp3Buffer,
              stream: Readable.from(mp3Buffer),
              format: 'mp3',
            };
          } catch (error) {
            console.error('[FishAudioService] WAV to MP3 conversion failed:', error);
            console.log('[FishAudioService] Falling back to WAV format');
            return {
              buffer: processedBuffer,
              stream: Readable.from(processedBuffer),
              format: 'wav',
            };
          }
        } else {
          console.warn('[FishAudioService] ffmpeg not available, returning WAV format');
          return {
            buffer: processedBuffer,
            stream: Readable.from(processedBuffer),
            format: 'wav',
          };
        }
      }

      console.log('[FishAudioService] Returning WAV with radio effects');
      return {
        buffer: processedBuffer,
        stream: Readable.from(processedBuffer),
        format: 'wav',
      };
    }

    console.log('[FishAudioService] No radio effects requested, returning original audio');
    return {
      buffer: audioBuffer,
      stream: Readable.from(audioBuffer),
      format,
    };
  }

  /**
   * Set the API key for Fish Audio
   */
  static setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
    // Reset client to use new API key
    this.client = null;
  }

  /**
   * Apply radio effects to audio buffer (PCM format only)
   */
  private static async applyRadioEffectsIfNeeded(
    audioBuffer: Buffer,
    radioEffects: 'standard' | 'light' | 'heavy' | 'clear' | RadioEffectsConfig,
    format: string
  ): Promise<Buffer> {
    console.log('[FishAudioService] applyRadioEffectsIfNeeded called');
    console.log('[FishAudioService] Format:', format);
    console.log('[FishAudioService] Radio effects:', typeof radioEffects === 'string' ? radioEffects : 'custom config');
    console.log('[FishAudioService] Buffer size:', audioBuffer.length, 'bytes');

    try {
      // Get radio effects configuration
      let config: RadioEffectsConfig;
      let presetName = 'unknown';

      if (typeof radioEffects === 'string') {
        presetName = radioEffects;
        switch (radioEffects) {
          case 'standard':
            config = STANDARD_RADIO_CONFIG;
            break;
          case 'light':
            config = LIGHT_RADIO_CONFIG;
            break;
          case 'heavy':
            config = HEAVY_RADIO_CONFIG;
            break;
          case 'clear':
            config = CLEAR_CONFIG;
            break;
          default:
            config = STANDARD_RADIO_CONFIG;
            presetName = 'standard (default)';
        }
        console.log(`[FishAudioService] Using preset: ${presetName}`);
      } else {
        config = radioEffects;
        presetName = 'custom';
        console.log('[FishAudioService] Using custom configuration');
      }

      // Skip if effects are disabled
      if (!config.enabled) {
        console.log('[FishAudioService] Radio effects disabled, returning original buffer');
        return audioBuffer;
      }

      // Apply effects for WAV format
      if (format === 'wav') {
        console.log(`[FishAudioService] ✅ Format is WAV, applying radio effects...`);
        const result = await applyRadioEffects(audioBuffer, config, format);
        console.log('[FishAudioService] ✅ Radio effects applied, result buffer size:', result.length, 'bytes');
        return result;
      }

      // Warn for unsupported formats
      console.warn(`[FishAudioService] ⚠️ Radio effects only support WAV format, skipping for '${format}'`);
      return audioBuffer;
    } catch (error) {
      console.error('[FishAudioService] ❌ Failed to apply radio effects:', error);
      return audioBuffer;
    }
  }
}
