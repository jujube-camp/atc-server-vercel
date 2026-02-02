/**
 * Shared Pino logger instance that matches Fastify's logger configuration
 * Use this instead of console.log throughout the codebase for consistent formatting
 */
import pino from 'pino';
import type { FastifyBaseLogger } from 'fastify';

const NODE_ENV = process.env.NODE_ENV || 'development';
const LOG_LEVEL = (process.env.LOG_LEVEL as pino.Level) || 'info';

export const logger: FastifyBaseLogger = pino({
  level: LOG_LEVEL,
  transport: NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
    },
  } : undefined,
});

