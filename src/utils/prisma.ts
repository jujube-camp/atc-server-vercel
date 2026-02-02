import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

/**
 * Singleton Prisma client instance.
 * Uses Neon pooled DATABASE_URL for serverless (no driver adapter needed).
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
