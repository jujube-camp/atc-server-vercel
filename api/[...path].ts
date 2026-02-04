import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildServer } from '../dist/server.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance | null = null;

async function getApp(): Promise<FastifyInstance> {
  if (!app) {
    app = await buildServer();
    await app.ready();
  }
  return app;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Vercel may pass the path relative to /api (e.g. /v1/auth/login). Fastify expects /api/v1/...
  const url = req.url ?? '/';
  if (!url.startsWith('/api')) {
    req.url = url.startsWith('/') ? `/api${url}` : `/api/${url}`;
  }
  const fastify = await getApp();
  await fastify.ready();
  const nodeServer = (fastify as unknown as { server: NodeJS.HttpServer }).server;
  nodeServer.emit('request', req, res);
}
