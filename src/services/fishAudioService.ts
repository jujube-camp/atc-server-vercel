import { FishAudioClient } from 'fish-audio';
import { Readable } from 'stream';
import { ProxyAgent } from 'undici';
import { env } from '../config/env.js';

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
   * @param options - TTS options including text, format, reference_id, etc.
   * @returns Promise<Readable> containing the complete audio data
   */
  static async generateAudio(
    options: FishAudioTTSOptions
  ): Promise<Readable> {
    const { text, format = 'mp3', reference_id, ...restOptions } = options;

    if (!this.apiKey) {
      throw new Error('FISH_AUDIO_API_KEY is not configured');
    }

    const client = this.getClient(this.apiKey);

    const audioIterable = await client.textToSpeech.convert({
      text,
      format,
      reference_id: reference_id || env.FISH_AUDIO_REFERENCE_ID,
      ...restOptions,
    });

    const chunks: Buffer[] = [];
    for await (const chunk of audioIterable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const audioBuffer = Buffer.concat(chunks);
    return Readable.from(audioBuffer);
  }

  /**
   * Generate audio response and return both buffer and stream
   * @param options - TTS options including text, format, reference_id, etc.
   * @returns Promise with audio buffer and stream
   */
  static async generateAudioWithBuffer(
    options: FishAudioTTSOptions
  ): Promise<{ buffer: Buffer; stream: Readable; format: string }> {
    const { text, format = 'mp3', reference_id, ...restOptions } = options;

    if (!this.apiKey) {
      throw new Error('FISH_AUDIO_API_KEY is not configured');
    }

    const client = this.getClient(this.apiKey);

    const audioIterable = await client.textToSpeech.convert({
      text,
      format,
      reference_id: reference_id || env.FISH_AUDIO_REFERENCE_ID,
      ...restOptions,
    });

    const chunks: Buffer[] = [];
    for await (const chunk of audioIterable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const audioBuffer = Buffer.concat(chunks);
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
}

