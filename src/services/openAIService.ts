import { readFileSync } from 'fs';
import OpenAI from 'openai';
import { HttpsProxyAgent } from 'https-proxy-agent';
import fetch from 'node-fetch';
import type { FastifyBaseLogger } from 'fastify';
import { logger as defaultLogger } from '../utils/logger.js';

export interface TranscriptionOptions {
  prompt?: string;
  model?: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  text_format?: any; // Will be the zodTextFormat result
}

export interface ChatResponse<T> {
  data: T;
  response_id: string;
}

export interface TTSOptions {
  voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  model?: string;
  stream?: boolean; // If true, returns ReadableStream instead of Buffer
}

export class OpenAIService {
  private readonly client: OpenAI;
  private readonly apiKey: string;

  constructor(apiKey: string, proxyUrl?: string) {
    this.apiKey = apiKey;
    
    // Configure proxy if available
    // Priority: 1. explicit proxyUrl parameter, 2. environment variables
    let customFetch;
    const effectiveProxyUrl = proxyUrl || 
      process.env.HTTPS_PROXY || 
      process.env.HTTP_PROXY || 
      process.env.PROXY;
    
    if (effectiveProxyUrl) {
      const httpsAgent = new HttpsProxyAgent(effectiveProxyUrl);
      
      // Create custom fetch function with proxy
      customFetch = async (url: string | Request | URL, init?: RequestInit) => {
        const modifiedInit = {
          ...init,
          agent: httpsAgent,
        };
        return fetch(url as string, modifiedInit as any);
      };
    }

    this.client = new OpenAI({
      apiKey: this.apiKey,
      ...(customFetch && { fetch: customFetch as any }),
    });
  }

  /**
   * Transcribe audio using gpt-4o-transcribe model
   * @param audioInput - Either a Buffer containing audio data or a file path to the WAV audio file
   * @param options - Transcription options including prompt and model
   * @param logger - Logger instance (defaults to pino logger)
   * @returns Promise<string> - The transcribed text
   */
  async transcribeAudio(
    audioInput: string | Buffer,
    options: TranscriptionOptions = {},
    logger: FastifyBaseLogger = defaultLogger
  ): Promise<string> {
    const {
      prompt,
      model = 'gpt-4o-transcribe',
    } = options;

    try {
      let audioFile: File;
      
      if (typeof audioInput === 'string') {
        // Input is a file path
        const audioBuffer = readFileSync(audioInput);
        audioFile = new File([audioBuffer], 'audio.wav', { type: 'audio/wav' });
      } else {
        // Input is a Buffer
        audioFile = new File([audioInput], 'audio.wav', { type: 'audio/wav' });
      }
      
      const transcription = await this.client.audio.transcriptions.create({
        file: audioFile,
        model,
        ...(prompt && { prompt }),
      });

      return transcription.text;
    } catch (error) {
      logger.error({ error }, 'Error transcribing audio');
      throw new Error(`Failed to transcribe audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Send user message and system prompt to OpenAI and get structured response using the Responses API
   * @param userMessage - The user's message
   * @param systemPrompt - The system prompt to guide the AI
   * @param textFormat - The zodTextFormat for structured output
   * @param options - Chat options including model, temperature, and max_tokens
   * @param logger - Logger instance (defaults to pino logger)
   * @returns Promise<ChatResponse<T>> - The parsed response and response ID
   */
  async chatWithAI<T>(
    userMessage: string,
    systemPrompt: string,
    textFormat: any,
    options: ChatOptions = {},
    logger: FastifyBaseLogger = defaultLogger
  ): Promise<ChatResponse<T>> {
    const {
      model = 'gpt-5.1',
      max_tokens = 1000,
    } = options;

    try {
      const requestOptions: any = {
        model,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ],
        max_output_tokens: max_tokens,
        text: {
          format: textFormat
        },
      };

      const response = await this.client.responses.parse(requestOptions);

      return {
        data: response.output_parsed as T,
        response_id: response.id,
      };
    } catch (error) {
      logger.error({ error }, 'Error in chat response');
      throw new Error(`Failed to get AI response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate audio response from text using OpenAI TTS
   * @param text - Text to convert to speech
   * @param options - TTS options including voice, model, and stream flag
   * @param logger - Logger instance (defaults to pino logger)
   * @returns Promise<Buffer> if stream=false, or Promise<Node.js ReadableStream> if stream=true
   */
  async generateAudioResponse(
    text: string,
    options: TTSOptions = {},
    logger: FastifyBaseLogger = defaultLogger
  ): Promise<Buffer | any> {
    const {
      voice = 'alloy',
      model = 'gpt-4o-mini-tts',
      stream = false,
    } = options;

    try {
      const response = await this.client.audio.speech.create({
        model,
        voice,
        input: text,
        response_format: 'mp3',
        instructions: 'Please generate realistic audio from radio transmission. It includes noise of radio and other ambient noise. Use a faster pacing',
      });

      // If streaming is requested, return the response body directly (Node.js ReadableStream)
      if (stream && response.body) {
        return response.body;
      }

      // Default: convert the response to Buffer (backward compatible)
      const buffer = Buffer.from(await response.arrayBuffer());
      return buffer;
    } catch (error) {
      logger.error({ error }, 'Error generating audio');
      throw new Error(`Failed to generate audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
