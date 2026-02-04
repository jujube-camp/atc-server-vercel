import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance | null = null;

async function getApp(): Promise<FastifyInstance> {
  if (!app) {
    // Dynamic import to avoid issues with Vercel's build
    const { buildServer } = await import('../dist/server.js');
    app = await buildServer();
    await app.ready();
  }
  return app;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const fastify = await getApp();
    
    // Normalize URL: Vercel passes path relative to /api, Fastify expects /api/v1/...
    let url = req.url ?? '/';
    if (!url.startsWith('/api')) {
      url = `/api${url.startsWith('/') ? url : '/' + url}`;
    }

    // Use Fastify's inject for reliable serverless handling
    const response = await fastify.inject({
      method: req.method as any,
      url,
      headers: req.headers as any,
      payload: req.body as any,
    });

    // Copy response headers
    const headers = response.headers;
    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined) {
        res.setHeader(key, value as string);
      }
    }

    res.status(response.statusCode).send(response.payload);
  } catch (error) {
    console.error('[Vercel Handler] Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
