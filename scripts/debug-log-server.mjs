#!/usr/bin/env node

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const port = Number.parseInt(process.env.PLUGIN_DEBUG_LOG_PORT || '4789', 10);
const host = process.env.PLUGIN_DEBUG_LOG_HOST || '127.0.0.1';
const logFile = process.env.PLUGIN_DEBUG_LOG_FILE || path.join('.local', 'figma-debug.log');
const clearOnStart = process.argv.includes('--clear');
const maxBodyBytes = 5 * 1024 * 1024;

fs.mkdirSync(path.dirname(logFile), { recursive: true });
if (clearOnStart) {
  fs.writeFileSync(logFile, '');
}

function send(res, status, body, contentType = 'text/plain') {
  res.writeHead(status, {
    'content-type': contentType,
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
  });
  res.end(body);
}

function formatEvent(event) {
  const value = event !== null && typeof event === 'object' ? event : {};
  const ts = typeof value.ts === 'string' ? value.ts : new Date().toISOString();
  const time = ts.slice(11, 23);
  const source = typeof value.source === 'string' ? value.source : 'unknown';
  const scope = typeof value.scope === 'string' ? value.scope : 'unknown';
  const name = typeof value.event === 'string' ? value.event : 'unknown';
  const data = value.data === undefined ? '' : ' ' + compactJson(value.data);
  return `[${time}][${source}][${scope}] ${name}${data}`;
}

function compactJson(value) {
  const text = JSON.stringify(value);
  if (text === undefined) return '';
  return text.length > 500 ? text.slice(0, 500) + '…' : text;
}

function normalizeEvents(payload) {
  if (payload !== null && typeof payload === 'object' && Array.isArray(payload.events)) {
    return payload.events;
  }
  return [payload];
}

function handleLog(req, res) {
  let size = 0;
  const chunks = [];
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > maxBodyBytes) {
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    let payload;
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (_err) {
      send(res, 400, 'invalid json');
      return;
    }

    const events = normalizeEvents(payload);
    const lines = [];
    for (const event of events) {
      const record = {
        receivedAt: new Date().toISOString(),
        event,
      };
      fs.appendFileSync(logFile, JSON.stringify(record) + '\n');
      lines.push(formatEvent(event));
    }

    for (const line of lines) {
      console.log(line);
    }
    send(res, 204, '');
  });
  req.on('error', () => {
    send(res, 500, 'request error');
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    send(res, 204, '');
    return;
  }
  if (req.method === 'GET' && req.url === '/health') {
    send(res, 200, JSON.stringify({ ok: true, logFile }), 'application/json');
    return;
  }
  if (req.method === 'POST' && req.url === '/log') {
    handleLog(req, res);
    return;
  }
  send(res, 404, 'not found');
});

server.listen(port, host, () => {
  console.log(`[figma-debug-log] listening on http://${host}:${port}/log`);
  console.log(`[figma-debug-log] writing ${logFile}`);
});

function shutdown() {
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
