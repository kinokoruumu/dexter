#!/usr/bin/env bun
import { config } from 'dotenv';
import { runAgent } from './run-agent.js';

// Load environment variables
config({ quiet: true });

const port = Number(process.env.PORT) || 8080;

const server = Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);

    // Health check
    if (req.method === 'GET' && url.pathname === '/health') {
      return Response.json({ status: 'ok' });
    }

    // Query endpoint
    if (req.method === 'POST' && url.pathname === '/query') {
      try {
        const body = await req.json() as { query?: string; model?: string; maxIterations?: number };
        const { query, model, maxIterations } = body;

        if (!query || typeof query !== 'string') {
          return Response.json({ error: 'query is required' }, { status: 400 });
        }

        const answer = await runAgent(query, { model, maxIterations });
        return Response.json({ answer });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[/query] Error:', message);
        return Response.json({ error: message }, { status: 500 });
      }
    }

    return Response.json({ error: 'Not Found' }, { status: 404 });
  },
});

console.log(`dexter API server listening on port ${server.port}`);
