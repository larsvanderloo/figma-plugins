#!/usr/bin/env node
// dev-console-bridge/server.mjs
//
// Tiny HTTP server that receives plugin console output over HTTP POST
// and prints it to the developer's terminal with ANSI colour formatting.
//
// Used by `pnpm --filter @figma-plugins/welder-editor dev:logs`.
// Does NOT run in production — only invoked explicitly during local dev.
//
// Protocol: POST / with JSON body:
//   { level: 'log' | 'warn' | 'error' | 'rejection', args: string[], ts: number }
//
// No external deps — pure Node.js built-ins (node:http, node:process).
//
// Port: 8765 (configurable via DEV_CONSOLE_PORT env var)

import { createServer } from 'node:http';
import { hostname } from 'node:os';

const PORT = parseInt(process.env.DEV_CONSOLE_PORT ?? '8765', 10);

// ANSI colour codes
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const RED_BOLD = '\x1b[1;31m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';

/** Format a log entry for terminal output. */
function formatEntry(level, args, ts) {
  const time = new Date(ts).toISOString().slice(11, 23); // HH:MM:SS.mmm
  const msg = args.join(' ');

  switch (level) {
    case 'warn':
      return `${DIM}${time}${RESET} ${YELLOW}${BOLD}WARN${RESET}  ${msg}`;
    case 'error':
      return `${DIM}${time}${RESET} ${RED_BOLD}ERROR${RESET} ${msg}`;
    case 'rejection':
      return `${DIM}${time}${RESET} ${RED_BOLD}UNHANDLED REJECTION${RESET} ${msg}`;
    default:
      return `${DIM}${time}${RESET} ${GREEN}LOG${RESET}   ${msg}`;
  }
}

const server = createServer((req, res) => {
  // CORS headers so the Figma iframe (if needed) can also POST here.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end('Method Not Allowed');
    return;
  }

  let body = '';
  req.on('data', (chunk) => {
    body += chunk.toString();
    // Guard against excessively large payloads
    if (body.length > 64 * 1024) {
      res.writeHead(413);
      res.end('Payload Too Large');
      req.destroy();
    }
  });

  req.on('end', () => {
    try {
      const entry = JSON.parse(body);
      const { level = 'log', args = [], ts = Date.now() } = entry;
      process.stdout.write(formatEntry(String(level), args.map(String), Number(ts)) + '\n');
      res.writeHead(204);
      res.end();
    } catch {
      res.writeHead(400);
      res.end('Bad Request');
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  const h = hostname();
  process.stdout.write(
    `${CYAN}${BOLD}[dev-console-bridge]${RESET} listening on ${BOLD}http://127.0.0.1:${PORT}${RESET}\n` +
      `${DIM}Waiting for plugin console output from Figma desktop (${h})...${RESET}\n` +
      `${DIM}Open the Welder Editor plugin in Figma to start streaming logs.${RESET}\n\n`,
  );
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    process.stderr.write(
      `${RED_BOLD}[dev-console-bridge] Port ${PORT} is already in use.${RESET}\n` +
        `Kill the existing server (lsof -ti:${PORT} | xargs kill) or set DEV_CONSOLE_PORT=<other-port>\n` +
        `and update manifest.dev.json to match.\n`,
    );
  } else {
    process.stderr.write(`${RED_BOLD}[dev-console-bridge] Server error:${RESET} ${err.message}\n`);
  }
  process.exit(1);
});
