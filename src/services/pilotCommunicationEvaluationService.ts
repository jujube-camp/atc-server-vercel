import { z } from 'zod';
import { zodTextFormat } from 'openai/helpers/zod';
import type { FastifyBaseLogger } from 'fastify';
import { OpenAIService } from './openAIService.js';
import { env } from '../config/env.js';
import { loadPrompt } from '../utils/promptUtils.js';

const EVALUATION_AGENT_PROMPT = loadPrompt('evaluation-agent-prompt.txt');

const PilotCommunicationEvaluationResponseSchema = z.object({
  feedback_score: z.number().int().min(1).max(5),
  feedback_comment: z.string(),
});

export type PilotCommunicationEvaluationResponse = z.infer<typeof PilotCommunicationEvaluationResponseSchema>;

export interface PilotCommunicationEvaluationContext {
  pilot_transcript: string;
  session_history: string[];  // Last 10 transmissions for context
  current_phase_info: {
    current_phase: string;
    label: string;
    atc_guidance: {
      response_focus: string;
      examples?: string[];
      tower_initiate?: boolean;
    };
  };
  context: {
    airport_icao: string;
    expected_elements?: string[];
  };
}

export class PilotCommunicationEvaluationService {
  /**
   * Evaluate pilot communication quality
   * @param requestContext - Includes pilot transcript, session history, phase info, and context
   * @param logger - Fastify logger
   * Runs asynchronously in background, non-blocking
   */
  static async evaluatePilotCommunication(
    requestContext: PilotCommunicationEvaluationContext,
    logger: FastifyBaseLogger
  ): Promise<PilotCommunicationEvaluationResponse> {
    logger.info('[PilotCommunicationEvaluationService] Evaluating pilot communication...');
    
    const openaiService = new OpenAIService(env.OPENAI_API_KEY);
    
    const response = await openaiService.chatWithAI<PilotCommunicationEvaluationResponse>(
      JSON.stringify(requestContext),
      EVALUATION_AGENT_PROMPT,
      zodTextFormat(PilotCommunicationEvaluationResponseSchema, "evaluation"),
      {
        model: 'gpt-5.1',
        max_tokens: 500,
        temperature: 0.2,
      },
      logger
    );
    
    return response.data;
  }
}

