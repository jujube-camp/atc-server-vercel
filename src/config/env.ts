import dotenvFlow from 'dotenv-flow';
import { z } from 'zod';

// If NODE_ENV is not defined, default to 'development'
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

// Load environment variables from .env files if they exist (for local development)
// In Docker, env vars are passed at runtime via env_file or environment section
// silent: true means it won't fail if .env files don't exist (expected in Docker)
dotenvFlow.config({
  default_node_env: 'development',
  silent: true, // Don't fail if .env files don't exist (they're loaded at runtime in Docker)
});

const envSchema = z.object({
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string().min(32),
  PORT: z.string().default('3000').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  VERCEL: z.string().optional(),
  VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  LLM_VERBOSITY: z.enum(['low', 'high']).default('low'),
  OPENAI_API_KEY: z.string().min(1),
  FISH_AUDIO_API_KEY: z.string().optional(),
  FISH_AUDIO_REFERENCE_ID: z.string().default('27041c39c7ad4c02b14fe34af1211fce'),
  // Priority: HTTPS_PROXY > HTTP_PROXY > PROXY
  HTTPS_PROXY: z.string().optional(),
  HTTP_PROXY: z.string().optional(),
  PROXY: z.string().optional(),
  APPLE_CLIENT_ID: z.string().optional(),
  APPLE_SHARED_SECRET: z.string().optional(), // For App Store receipt verification
  AWS_REGION: z.string().optional(),
  AWS_S3_AUDIO_BUCKET: z.string().optional(),
  AWS_S3_AUDIO_PREFIX: z.string().default('cockpit/audio'),
  AWS_S3_ANALYSIS_PREFIX: z.string().default('analyze'),
  AWS_S3_AUDIO_BASE_URL: z.string().url().optional(),
  AWS_S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('false'),
  AUDIO_PROCESSOR_API_URL: z.string().url().optional(),
});

const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
  console.error('❌ Invalid environment variables:', parseResult.error.flatten().fieldErrors);
  process.exit(1);
} else {
  console.log(`✅ Environment variables loaded successfully: ${JSON.stringify(parseResult.data, null, 2)}`);
}

export const env = parseResult.data;

