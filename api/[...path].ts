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
  const fastify = await getApp();
  await fastify.ready();
  const nodeServer = (fastify as unknown as { server: NodeJS.HttpServer }).server;
  nodeServer.emit('request', req, res);
}
