#!/usr/bin/env tsx

import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import { HttpsProxyAgent } from 'https-proxy-agent';
import fetch from 'node-fetch';
import { z } from 'zod';
import { zodTextFormat } from 'openai/helpers/zod';

// Load environment variables from .env.test
dotenv.config({ path: '.env.test' });

async function testGPT41() {
  try {
    // Check if OpenAI API key is available
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('❌ OPENAI_API_KEY not set');
      process.exit(1);
    }

    console.log('🚀 Testing OpenAI API with gpt-4.1 model...\n');

    // Configure proxy if available
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.PROXY;
    let customFetch;

    if (proxyUrl) {
      console.log(`🔗 Using proxy: ${proxyUrl}`);
      const httpsAgent = new HttpsProxyAgent(proxyUrl);
      
      // Create custom fetch function with proxy
      customFetch = async (url: string | Request | URL, init?: RequestInit) => {
        const modifiedInit = {
          ...init,
          agent: httpsAgent,
        };
        return fetch(url as string, modifiedInit as any);
      };
    } else {
      console.log('ℹ️  No proxy configured (set HTTPS_PROXY, HTTP_PROXY, or PROXY env var to use proxy)');
    }

    // Initialize the OpenAI client
    const openai = new OpenAI({
      apiKey: apiKey,
      ...(customFetch && { fetch: customFetch as any }),
    });

    // Test message
    const systemPrompt = 'You are a helpful assistant.';
    const userMessage = 'Hello, can you tell me a short joke?';

    console.log('📤 Sending request...');
    console.log(`System: ${systemPrompt}`);
    console.log(`User: ${userMessage}\n`);

    const startTime = Date.now();

    // Create a simple Zod schema for text response
    const TextResponseSchema = z.object({
      response: z.string()
    });

    // Test with gpt-4.1 model using responses API
    const response = await openai.responses.parse({
      model: 'gpt-4.1',
      input: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      max_output_tokens: 500,
      text: {
        format: zodTextFormat(TextResponseSchema, 'response')
      }
    });

    const endTime = Date.now();
    const latency = endTime - startTime;

    console.log('📥 Response received:');
    console.log(`Response ID: ${response.id}`);
    console.log(`Response:`, response.output_parsed);
    if (response.output_parsed && typeof response.output_parsed === 'object' && 'response' in response.output_parsed) {
      console.log(`Response text: ${(response.output_parsed as any).response}`);
    }
    console.log(`\n⏱️  Latency: ${latency}ms`);

    console.log('\n✅ Test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the test
testGPT41()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });

