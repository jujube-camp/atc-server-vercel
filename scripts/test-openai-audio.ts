#!/usr/bin/env tsx

import { readFileSync, writeFileSync, statSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { OpenAIService } from '../src/services/openAIService';

// Load environment variables from .env.test
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.test' });

async function testOpenAIService() {
  try {
    // Check if OpenAI API key is available
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('❌ OPENAI_API_KEY not set');
      process.exit(1);
    }

    console.log('🚀 Starting OpenAI Service Tests...\n');

    // Initialize the OpenAI service
    const openaiService = new OpenAIService(apiKey);
    
    // Ensure uploads directory exists
    const uploadsDir = join(process.cwd(), 'uploads', 'audio');
    try {
      mkdirSync(uploadsDir, { recursive: true });
    } catch (error) {
      // Directory might already exist, ignore error
    }

    const results = {
      transcription: { latency: 0, cost: 0 },
      chat: { latency: 0, cost: 0 },
      tts: { latency: 0, cost: 0 }
    };

    // Test 1: Audio Transcription
    console.log('🎤 Testing Audio Transcription...');
    results.transcription = await testAudioTranscription(openaiService);

    // Test 2: Text Chat
    console.log('💬 Testing Text Chat...');
    results.chat = await testTextChat(openaiService);

    // Test 3: Text-to-Speech
    console.log('🔊 Testing Text-to-Speech...');
    results.tts = await testTextToSpeech(openaiService);

    // Summary
    console.log('\n📊 Test Results Summary:');
    console.log(`Transcription: ${results.transcription.latency}ms, $${results.transcription.cost.toFixed(4)}`);
    console.log(`Chat: ${results.chat.latency}ms, $${results.chat.cost.toFixed(4)}`);
    console.log(`TTS: ${results.tts.latency}ms, $${results.tts.cost.toFixed(4)}`);
    
    const totalLatency = results.transcription.latency + results.chat.latency + results.tts.latency;
    const totalCost = results.transcription.cost + results.chat.cost + results.tts.cost;
    console.log(`Total: ${totalLatency}ms, $${totalCost.toFixed(4)}`);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

async function testAudioTranscription(openaiService: OpenAIService): Promise<{latency: number, cost: number}> {
  try {
    // Check if we have a sample audio file
    const sampleAudioPath = join(process.cwd(), 'scripts', 'test.wav');
    let audioFilePath: string;

    try {
      readFileSync(sampleAudioPath);
      audioFilePath = sampleAudioPath;
    } catch (error) {
      // Generate sample audio using TTS first
      const sampleText = "Ground, Cessna one two three alpha bravo, ready to taxi with Information Alpha";
      const audioBuffer = await openaiService.generateAudioResponse(sampleText);
      audioFilePath = join(process.cwd(), 'temp_test_audio.mp3');
      writeFileSync(audioFilePath, audioBuffer);
    }

    const startTime = Date.now();
    const transcription = await openaiService.transcribeAudio(audioFilePath, {
      prompt: "Please transcribe an audio from pilot at ReidHillview Airport. Use ICAO phonetics for call signs.",
      model: 'gpt-4o-transcribe'
    });
    const endTime = Date.now();

    const latency = endTime - startTime;
    // Approximate cost for gpt-4o-transcribe: $0.01 per minute of audio
    const audioDuration = 10; // Assume 10 seconds for sample audio
    const cost = (audioDuration / 60) * 0.01;

    console.log(`  ✓ Transcribed: "${transcription.substring(0, 50)}..." (${latency}ms)`);
    
    // Clean up temporary file if we created one
    if (audioFilePath.includes('temp_test_audio.mp3')) {
      try {
        unlinkSync(audioFilePath);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
    }

    return { latency, cost };

  } catch (error) {
    console.error(`  ✗ Failed: ${error.message}`);
    throw error;
  }
}

async function testTextChat(openaiService: OpenAIService): Promise<{latency: number, cost: number}> {
  try {
    const systemPrompt = `You are an Air Traffic Control (ATC) simulator. 
    Respond to pilot communications in a professional, concise manner typical of real ATC operations.
    Use standard aviation phraseology and maintain a professional tone.`;
    
    const userMessage = "Ground, Cessna 123AB, ready to taxi with Information Alpha";

    const startTime = Date.now();
    const response = await openaiService.chatWithAI(userMessage, systemPrompt, {
      model: 'gpt-4o',
      temperature: 0.7,
      max_tokens: 200
    });
    const endTime = Date.now();

    const latency = endTime - startTime;
    // Approximate cost for gpt-4o: $0.005 per 1K input tokens, $0.015 per 1K output tokens
    const inputTokens = Math.ceil((systemPrompt.length + userMessage.length) / 4); // Rough estimate
    const outputTokens = Math.ceil(response.length / 4);
    const cost = (inputTokens / 1000) * 0.005 + (outputTokens / 1000) * 0.015;

    console.log(`  ✓ Chat: "${response.substring(0, 50)}..." (${latency}ms)`);

    return { latency, cost };

  } catch (error) {
    console.error(`  ✗ Failed: ${error.message}`);
    throw error;
  }
}

async function testTextToSpeech(openaiService: OpenAIService): Promise<{latency: number, cost: number}> {
  try {
    const textToConvert = "Cessna 123AB, Ground, taxi to runway 12L via Alpha, hold short of runway 12R";

    const startTime = Date.now();
    const audioBuffer = await openaiService.generateAudioResponse(textToConvert, {
      voice: 'alloy',
      model: 'tts-1',
    });
    
    // Save audio buffer to file
    const audioFilePath = join(process.cwd(), 'uploads', 'audio', `test_tts_${Date.now()}.mp3`);
    writeFileSync(audioFilePath, audioBuffer);
    const endTime = Date.now();

    const latency = endTime - startTime;
    // Approximate cost for tts-1: $0.015 per 1K characters
    const cost = (textToConvert.length / 1000) * 0.015;

    console.log(`  ✓ TTS: Generated audio (${latency}ms)`);
    
    // Clean up test file
    try {
      unlinkSync(audioFilePath);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }

    return { latency, cost };

  } catch (error) {
    console.error(`  ✗ Failed: ${error.message}`);
    throw error;
  }
}

// Run the test suite
testOpenAIService()
  .then(() => {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Tests failed:', error.message);
    process.exit(1);
  });
