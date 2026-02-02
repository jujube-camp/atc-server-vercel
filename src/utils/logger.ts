/**
 * Shared Pino logger instance that matches Fastify's logger configuration
 * Use this instead of console.log throughout the codebase for consistent formatting
 * On Vercel/serverless we never use pino-pretty (not available, transport fails).
 */
import pino from 'pino';
import type { FastifyBaseLogger } from 'fastify';

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_VERCEL = process.env.VERCEL === '1';
const LOG_LEVEL = (process.env.LOG_LEVEL as pino.Level) || 'info';

// Only use pino-pretty in local development; Vercel/serverless has no worker support for it
const usePretty = NODE_ENV === 'development' && !IS_VERCEL;

export const logger: FastifyBaseLogger = pino({
  level: LOG_LEVEL,
  transport: usePretty
    ? {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});

