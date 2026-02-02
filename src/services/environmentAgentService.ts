import { zodTextFormat } from 'openai/helpers/zod';
import type { FastifyBaseLogger } from 'fastify';
import { OpenAIService } from './openAIService.js';
import { env } from '../config/env.js';
import { loadPrompt } from '../utils/promptUtils.js';
import { z } from 'zod';

const isVerbose = env.LLM_VERBOSITY === 'high';

const ENVIRONMENT_AGENT_PROMPT_BASE = loadPrompt('environment-agent-prompt.txt');

// High verbosity: ask for reasoning for debugging
// Low verbosity: ask for empty string to save output tokens
const REASONING_INSTRUCTION_VERBOSE = '"string - brief reasoning for location inference"';
const REASONING_INSTRUCTION_LOW = '"" (always empty string)';

const ENVIRONMENT_AGENT_PROMPT = ENVIRONMENT_AGENT_PROMPT_BASE.replace(
  '{{REASONING_INSTRUCTION}}',
  isVerbose ? REASONING_INSTRUCTION_VERBOSE : REASONING_INSTRUCTION_LOW
);

// Response type for Environment Agent
export interface EnvironmentAgentResponse {
  location: string;
  reasoning: string;
}

// Zod schema for OpenAI structured output
const EnvironmentAgentResponseSchema = z.object({
  location: z.string(),
  reasoning: z.string(),
});

/**
 * Context for environment agent location inference
 */
export interface EnvironmentAgentContext {
  airportIcao: string;
  aircraftTailNumber: string;
  airportInfo?: string; // JSON string of airport info
}

export class EnvironmentAgentService {
  /**
   * Infer pilot's current location based on phase, conversation history, and agent context
   * @param phase - Current phase name
   * @param history - Session history (oldest first)
   * @param agentContext - Context including airport and aircraft info
   * @param logger - Fastify logger
   * @returns Inferred location string
   */
  static async inferLocation(
    phase: string,
    history: string[],
    agentContext: EnvironmentAgentContext,
    logger: FastifyBaseLogger
  ): Promise<string> {
    logger.info({ phase, historyLength: history.length, airportIcao: agentContext.airportIcao }, '[EnvironmentAgentService] Inferring location...');
    
    const context = {
      static_context: {
        airport_icao: agentContext.airportIcao,
        aircraft_tail_number: agentContext.aircraftTailNumber,
        airport_info: agentContext.airportInfo || '{}',
      },
      current_phase: phase,
      session_history: history.slice(-10), // Last 10 transmissions
    };
    
    const openaiService = new OpenAIService(env.OPENAI_API_KEY);
    const response = await openaiService.chatWithAI<EnvironmentAgentResponse>(
      JSON.stringify(context),
      ENVIRONMENT_AGENT_PROMPT,
      zodTextFormat(EnvironmentAgentResponseSchema, "location"),
      {
        model: 'gpt-4.1-mini',
        temperature: 0.3,
        max_tokens: 200,
      },
      logger
    );
    
    logger.info(
      { location: response.data.location, ...(isVerbose && { reasoning: response.data.reasoning }) },
      '[EnvironmentAgentService] Location inferred'
    );
    
    if (!response.data.location || typeof response.data.location !== 'string' || response.data.location.trim() === '') {
      return 'Unknown';
    }
    
    return response.data.location;
  }
}

