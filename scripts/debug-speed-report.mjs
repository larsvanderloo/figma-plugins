#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const logFile = readLogFile();
const limit = readLimit();

function readLogFile() {
  let chosen = process.env.PLUGIN_DEBUG_LOG_FILE || path.join('.local', 'figma-debug.log');
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--limit') {
      i++;
      continue;
    }
    if (arg.indexOf('--') === 0) continue;
    chosen = arg;
  }
  return chosen;
}

function readLimit() {
  const idx = args.indexOf('--limit');
  if (idx >= 0 && idx + 1 < args.length) {
    const parsed = Number.parseInt(args[idx + 1], 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 12;
}

function readRecords(file) {
  if (!fs.existsSync(file)) {
    throw new Error('debug log not found: ' + file);
  }
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const records = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed !== null && typeof parsed === 'object' && parsed.event !== undefined) {
        records.push(parsed.event);
      }
    } catch (_err) {
      // Ignore partial lines written while the log server is appending.
    }
  }
  return records;
}

function metricFor(event) {
  const data = event.data;
  if (data === null || data === undefined || typeof data !== 'object') return null;
  const record = data;
  const fields = ['totalMs', 'ms', 'applyMs', 'scanMs', 'importMs', 'postMs', 'signatureMs'];
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return { field, value };
    }
  }
  return null;
}

function groupKey(event) {
  const data = event.data;
  if (data !== null && data !== undefined && typeof data === 'object') {
    const record = data;
    if (event.event === 'ui-roundtrip' && typeof record.type === 'string') {
      return event.event + ':' + record.type;
    }
    if (event.event === 'sandbox-handler' && typeof record.type === 'string') {
      return event.event + ':' + record.type;
    }
    if (event.event === 'icon-import' && typeof record.method === 'string') {
      return event.event + ':' + record.method;
    }
    if (typeof record.reason === 'string') {
      return event.event + ':' + record.reason;
    }
  }
  return event.event;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

function summarize(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  return {
    count: sorted.length,
    avg: sum / sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1],
  };
}

function fmtMs(value) {
  return String(Math.round(value)).padStart(5, ' ') + 'ms';
}

function printTable(title, rows) {
  console.log('');
  console.log(title);
  if (rows.length === 0) {
    console.log('  no timed events');
    return;
  }
  console.log('  count  avg    p50    p95    max    event');
  for (const row of rows.slice(0, limit)) {
    console.log(
      String(row.summary.count).padStart(7, ' ') +
        ' ' +
        fmtMs(row.summary.avg) +
        ' ' +
        fmtMs(row.summary.p50) +
        ' ' +
        fmtMs(row.summary.p95) +
        ' ' +
        fmtMs(row.summary.max) +
        '  ' +
        row.key,
    );
  }
}

function main() {
  const records = readRecords(logFile);
  const perf = records.filter((event) => event.scope === 'perf');
  const groups = new Map();
  const slowest = [];

  for (const event of perf) {
    const metric = metricFor(event);
    if (metric === null) continue;
    const key = groupKey(event);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(metric.value);
    slowest.push({ event, key, field: metric.field, value: metric.value });
  }

  const rows = Array.from(groups.entries()).map(([key, values]) => ({
    key,
    summary: summarize(values),
  }));
  rows.sort((a, b) => b.summary.p95 - a.summary.p95 || b.summary.max - a.summary.max);

  const roundtripRows = rows.filter((row) => row.key.indexOf('ui-roundtrip:') === 0);
  const handlerRows = rows.filter((row) => row.key.indexOf('sandbox-handler:') === 0);
  const scanRows = rows.filter((row) => row.key.indexOf('scan-slide') === 0 || row.key.indexOf('post-slide') === 0 || row.key.indexOf('emit-slide') === 0);
  const cacheRows = rows.filter((row) => row.key.indexOf('icon-') === 0 || row.key.indexOf('prime-icon') === 0);

  slowest.sort((a, b) => b.value - a.value);

  console.log('Welder debug speed report');
  console.log('Log: ' + logFile);
  console.log('Events: ' + String(records.length) + ' total, ' + String(perf.length) + ' perf');

  printTable('Roundtrips', roundtripRows);
  printTable('Sandbox Handlers', handlerRows);
  printTable('Scans And Posts', scanRows);
  printTable('Icon Cache And Imports', cacheRows);
  printTable('All Timed Events', rows);

  console.log('');
  console.log('Slowest Events');
  if (slowest.length === 0) {
    console.log('  no timed events');
    return;
  }
  for (const item of slowest.slice(0, limit)) {
    const data = item.event.data !== undefined ? JSON.stringify(item.event.data) : '';
    const source = typeof item.event.source === 'string' ? item.event.source : 'unknown';
    console.log(
      '  ' +
        fmtMs(item.value) +
        '  [' +
        source +
        '] ' +
        item.key +
        ' (' +
        item.field +
        ') ' +
        data,
    );
  }
}

try {
  main();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error('[debug:speed] ' + message);
  process.exit(1);
}
