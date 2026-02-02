import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';

// Load environment variables for tests from .env.test
config({ path: '.env.test' });

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Suppress real-time progress updates to avoid breaking console.log output
    // Use 'basic' reporter for cleaner output, or 'verbose' for detailed results after completion
    reporter: process.env.TEST_REPORTER || 'basic',
    // Disable output truncation for better readability
    outputTruncateLength: Infinity,
    outputDiffLines: 50,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
    env: {
      // Set test environment variables
      NODE_ENV: 'test',
      JWT_SECRET: process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing-only-32-chars',
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/smart_atc?schema=public",
      PORT: '3001',
      LOG_LEVEL: 'info',
      LLM_VERBOSITY: 'high', // Set to low for all tests to avoid LLM outputting notes
    },
  },
});

