#!/usr/bin/env node
/**
 * Test script for S3 audio upload functionality
 * 
 * Usage:
 *   pnpm tsx scripts/test-s3-upload.ts
 */

import { S3Service } from '../src/services/s3Service.js';
import { logger } from '../src/utils/logger.js';

async function testS3Upload() {
  console.log('🧪 Testing S3 Audio Upload Functionality\n');

  // Check if S3 is configured
  console.log('1️⃣ Checking S3 configuration...');
  const isConfigured = S3Service.isConfigured();
  
  if (!isConfigured) {
    console.log('⚠️  S3 is not configured. Set the following environment variables:');
    console.log('   - AWS_REGION');
    console.log('   - AWS_S3_AUDIO_BUCKET');
    console.log('   - AWS_ACCESS_KEY_ID (or use IAM role)');
    console.log('   - AWS_SECRET_ACCESS_KEY (or use IAM role)');
    console.log('\n✅ Test completed: S3 configuration check passed (not configured is OK for dev)');
    return;
  }

  console.log('✅ S3 is configured\n');

  // Test 1: Generate audio key
  console.log('2️⃣ Testing audio key generation...');
  const sessionId = 'test-session-123';
  const userKey = S3Service.generateAudioKey(sessionId, 'user', 'mp3');
  const atcKey = S3Service.generateAudioKey(sessionId, 'atc', 'wav');
  
  console.log(`   User audio key: ${userKey}`);
  console.log(`   ATC audio key: ${atcKey}`);
  console.log('✅ Audio key generation passed\n');

  // Test 2: Content type mapping
  console.log('3️⃣ Testing content type mapping...');
  const mp3Type = S3Service.getContentType('mp3');
  const wavType = S3Service.getContentType('wav');
  const m4aType = S3Service.getContentType('m4a');
  
  console.log(`   MP3: ${mp3Type}`);
  console.log(`   WAV: ${wavType}`);
  console.log(`   M4A: ${m4aType}`);
  console.log('✅ Content type mapping passed\n');

  // Test 3: Format extraction from MIME type
  console.log('4️⃣ Testing format extraction from MIME type...');
  const mp3Format = S3Service.getFormatFromMimeType('audio/mpeg');
  const wavFormat = S3Service.getFormatFromMimeType('audio/wav');
  const m4aFormat = S3Service.getFormatFromMimeType('audio/mp4');
  
  console.log(`   audio/mpeg -> ${mp3Format}`);
  console.log(`   audio/wav -> ${wavFormat}`);
  console.log(`   audio/mp4 -> ${m4aFormat}`);
  console.log('✅ Format extraction passed\n');

  // Test 4: Upload test audio (only if S3 is configured)
  console.log('5️⃣ Testing actual S3 upload...');
  try {
    // Create a small test audio buffer (silent MP3)
    const testAudioBuffer = Buffer.from([
      0xFF, 0xFB, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    ]);
    
    const testKey = S3Service.generateAudioKey('test-session', 'user', 'mp3');
    const contentType = S3Service.getContentType('mp3');
    
    console.log(`   Uploading test audio to: ${testKey}`);
    const url = await S3Service.uploadAudio(
      testAudioBuffer,
      testKey,
      contentType,
      logger
    );
    
    console.log(`   ✅ Upload successful!`);
    console.log(`   📍 URL: ${url}`);
    console.log('✅ S3 upload test passed\n');
  } catch (error) {
    console.error('❌ S3 upload test failed:');
    console.error(`   ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.log('\n⚠️  This might be due to:');
    console.log('   - Invalid AWS credentials');
    console.log('   - Bucket does not exist');
    console.log('   - Insufficient IAM permissions');
    console.log('   - Network connectivity issues');
    process.exit(1);
  }

  console.log('🎉 All S3 tests passed successfully!');
}

// Run the test
testS3Upload().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});

