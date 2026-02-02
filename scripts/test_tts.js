#!/usr/bin/env node

import { OpenAIService } from '../src/services/openAIService.ts';
import { env } from '../src/config/env.ts';

async function testTTS() {
  try {
    console.log('🎤 Testing OpenAI TTS Audio Generation...\n');
    
    // Initialize the service
    const apiKey = env.OPENAI_API_KEY;
if (!apiKey) throw new Error('OPENAI_API_KEY must be set in environment');
const openaiService = new OpenAIService('gpt-4o-audio-preview', apiKey);
    
    // Test text
    const testText = "Ground, cleared to start engines and taxi to runway 27L via taxiway Alpha.";
    
    // Generate and save audio
    const filePath = await openaiService.testGenerateAudio(testText, 'atc_response.wav');
    
    console.log('\n✅ Test completed successfully!');
    console.log(`📁 Audio file saved at: ${filePath}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testTTS();
