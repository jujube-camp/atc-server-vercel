import { z } from 'zod';
import { zodTextFormat } from 'openai/helpers/zod';
import type { FastifyBaseLogger } from 'fastify';
import { OpenAIService } from './openAIService.js';
import { env } from '../config/env.js';
import { loadPrompt } from '../utils/promptUtils.js';
import type { EnvAgent } from './envAgent.js';

const ATC_AGENT_PROMPT_BASE = loadPrompt('atc-agent-prompt.txt');

// Schema with notes (for high verbosity)
const AtcAgentResponseSchemaVerbose = z.object({
  message: z.string(),
  expected: z.boolean(),
  notes: z.string(),
});

// Schema without notes (for low verbosity)
const AtcAgentResponseSchemaSimple = z.object({
  message: z.string(),
  expected: z.boolean(),
});

// Export union type for consumers
export type AtcAgentResponse = z.infer<typeof AtcAgentResponseSchemaVerbose> | z.infer<typeof AtcAgentResponseSchemaSimple>;

// Helper to get schema and prompt at runtime (respects env changes)
function getSchemaAndPrompt() {
  // Read directly from process.env to respect vitest config overrides
  const isVerbose = process.env.LLM_VERBOSITY === 'high';
  const schema = isVerbose ? AtcAgentResponseSchemaVerbose : AtcAgentResponseSchemaSimple;
  const prompt = ATC_AGENT_PROMPT_BASE.replace(
    '{{NOTES_FIELD}}',
    isVerbose ? `,\n  "notes": "string - brief reasoning for your decision"` : ''
  );
  return { schema, prompt, isVerbose };
}

import type { BaseAgentContext } from '../utils/agentContextHelper.js';

// Input context for ATC Agent (sent to LLM)
// Ordered for token caching: static_context (rarely changes) comes first,
// then current_phase_info, dynamic_context, and trigger_input (changes most frequently)
export interface AtcAgentContext extends BaseAgentContext {
  trigger_input: string; // Pilot transcript (for pilot_speech) or phase advancement description (for phase_entry)
  trigger_type?: 'pilot_speech' | 'phase_entry'; // Optional: distinguishes between pilot speaking vs phase advancement
  environment?: {
    runwaySituation?: {
      situation: string;
      notes?: string;
    };
    expectedRunway?: {
      runway: string;
      pattern: 'left' | 'right';
      notes?: string;
    };
  };
}

// Options for ATC agent (not sent to LLM)
export interface AtcAgentOptions {
  envAgent?: EnvAgent;
  envTools?: string[]; // Environment tools to call for this state (e.g., 'getRunwaySituation')
}

export class AtcAgentService {
  /**
   * Generate ATC response based on pilot transmission
   * Returns ATC message text (or empty string if no response needed)
   * @param requestContext - Context for ATC agent (sent to LLM)
   * @param logger - Fastify logger
   * @param options - Optional settings including envAgent and envTools
   */
  static async generateAtcResponse(
    requestContext: AtcAgentContext,
    logger: FastifyBaseLogger,
    options?: AtcAgentOptions
  ): Promise<AtcAgentResponse> {
    const { envAgent, envTools } = options || {};
    const effectiveEnvTools = envTools ?? [];
    
    // Check which env tools are needed from FSM config
    const currentPhase = requestContext.current_phase_info.current_phase;
    
    const needsTakeoffSituation = effectiveEnvTools.includes('getTakeoffSituation');
    const needsLandingSituation = effectiveEnvTools.includes('getLandingSituation');
    const needsExpectedRunway = effectiveEnvTools.includes('getExpectedRunway');
    
    // Get environment data based on configured tools
    let runwaySituation: { situation: string; notes?: string } | undefined;
    let expectedRunway: { runway: string; pattern: 'left' | 'right'; notes?: string } | undefined;
    
    if (envAgent) {
      if (needsTakeoffSituation) {
        const situation = await envAgent.getTakeoffSituation(currentPhase);
        runwaySituation = {
          situation: situation.situation,
          notes: situation.notes,
        };
        logger.info(
          { situation: situation.situation, currentPhase },
          '[AtcAgentService] Takeoff situation retrieved'
        );
      } else if (needsLandingSituation) {
        const situation = await envAgent.getLandingSituation(currentPhase);
        runwaySituation = {
          situation: situation.situation,
          notes: situation.notes,
        };
        logger.info(
          { situation: situation.situation, currentPhase },
          '[AtcAgentService] Landing situation retrieved'
        );
      }
      
      if (needsExpectedRunway) {
        const runway = await envAgent.getExpectedRunway();
        expectedRunway = {
          runway: runway.runway,
          pattern: runway.pattern,
          notes: runway.notes,
        };
        logger.info(
          { runway: runway.runway, pattern: runway.pattern, currentPhase },
          '[AtcAgentService] Expected runway retrieved'
        );
      }
    }

    // Build context for LLM
    const environment: AtcAgentContext['environment'] = {};
    if (runwaySituation) environment.runwaySituation = runwaySituation;
    if (expectedRunway) environment.expectedRunway = expectedRunway;
    
    const contextForLlm: AtcAgentContext = {
      ...requestContext,
      ...(Object.keys(environment).length > 0 && { environment }),
    };
    
    // Get schema and prompt at runtime to respect current env setting
    const { schema, prompt } = getSchemaAndPrompt();
    
    const openaiService = new OpenAIService(env.OPENAI_API_KEY);
    const response = await openaiService.chatWithAI<AtcAgentResponse>(
      JSON.stringify(contextForLlm),
      prompt,
      zodTextFormat(schema, "atc_response"),
      {
        model: 'gpt-5.1',
        max_tokens: 350,
        temperature: 0.05,
      },
      logger
    );

    const atcMessage = response.data.message ?? '';
    response.data.message = atcMessage.trim();
    return response.data;
  }
}
