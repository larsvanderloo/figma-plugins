// __PLUGIN_DEBUG__ and its siblings are injected by Vite/esbuild at build time; false/absent in normal builds.
declare const __PLUGIN_DEBUG__: boolean;
declare const __PLUGIN_DEBUG_SOURCE__: string;
declare const __PLUGIN_DEBUG_LOG_ENDPOINT__: string;

interface DebugFetchInit {
  method?: string;
  headers?: { [key: string]: string };
  body?: string;
}

declare function fetch(input: string, init?: DebugFetchInit): Promise<unknown>;

const MAX_STRING_LENGTH = 160;
const MAX_ARRAY_ITEMS = 8;
const MAX_OBJECT_KEYS = 20;
const MAX_DEPTH = 4;

export function isPluginDebugEnabled(): boolean {
  return typeof __PLUGIN_DEBUG__ !== 'undefined' && __PLUGIN_DEBUG__ === true;
}

export function debugLog(scope: string, event: string, data?: unknown): void {
  if (!isPluginDebugEnabled()) return;
  const prefix = '[welder-debug][' + scope + '] ' + event;
  const hasData = arguments.length >= 3;
  const summarized = hasData ? summarizeForDebug(data) : undefined;
  if (arguments.length >= 3) {
    console.log(prefix, summarized);
  } else {
    console.log(prefix);
  }
  postDebugLog(scope, event, summarized, hasData);
}

export function debugMessage(direction: string, msg: unknown): void {
  if (!isPluginDebugEnabled()) return;
  debugLog('bridge', direction + ' ' + readMessageType(msg), summarizeBridgeMessage(msg));
}

function readMessageType(msg: unknown): string {
  if (msg === null || msg === undefined || typeof msg !== 'object') return 'unknown';
  const typed = msg as { type?: unknown };
  return typeof typed.type === 'string' ? typed.type : 'unknown';
}

function summarizeBridgeMessage(msg: unknown): unknown {
  if (msg === null || msg === undefined || typeof msg !== 'object') return msg;
  const record = msg as { [key: string]: unknown };
  const type = typeof record.type === 'string' ? record.type : 'unknown';

  if (type === 'slide-loaded') {
    const content = record.content as { cards?: unknown } | null | undefined;
    const graphs = record.graphs as { instances?: unknown } | null | undefined;
    return {
      type: type,
      summary: record.summary,
      hasGeneral: record.general !== null && record.general !== undefined,
      hasContent: record.content !== null && record.content !== undefined,
      hasGraphs: record.graphs !== null && record.graphs !== undefined,
      cardCount: arrayLength(content !== null && content !== undefined ? content.cards : undefined),
      graphCount: arrayLength(graphs !== null && graphs !== undefined ? graphs.instances : undefined),
    };
  }

  if (type === 'card-visual-preview' || type === 'image-preview') {
    return {
      type: type,
      cardNodeId: record.cardNodeId,
      imageWrapId: record.imageWrapId,
      bytes: byteLength(record.bytes),
      fillW: record.fillW,
      fillH: record.fillH,
    };
  }

  if (type === 'document-ready') {
    return {
      type: type,
      target: record.target,
      format: record.format,
      bytes: byteLength(record.bytes),
      filename: record.filename,
      title: record.title,
    };
  }

  if (type === 'presentation-pdf-parts') {
    return {
      type: type,
      parts: arrayLength(record.parts),
      filename: record.filename,
      title: record.title,
    };
  }

  return msg;
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function byteLength(value: unknown): number {
  if (isUint8Array(value)) return value.length;
  return 0;
}

function postDebugLog(scope: string, event: string, data: unknown, hasData: boolean): void {
  const endpoint = readDebugLogEndpoint();
  if (endpoint.length === 0) return;
  if (typeof fetch !== 'function') return;

  const payload: { [key: string]: unknown } = {
    ts: new Date().toISOString(),
    source: readDebugLogSource(),
    scope: scope,
    event: event,
  };
  if (hasData) payload.data = data;

  fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(function (_err: unknown) {
    // Deliberate swallow: the local collector may not be running; console logging must stay unaffected.
  });
}

function readDebugLogEndpoint(): string {
  try {
    return __PLUGIN_DEBUG_LOG_ENDPOINT__;
  } catch (_err: unknown) {
    return '';
  }
}

function readDebugLogSource(): string {
  try {
    return __PLUGIN_DEBUG_SOURCE__;
  } catch (_err: unknown) {
    return 'unknown';
  }
}

function summarizeForDebug(value: unknown): unknown {
  return summarizeValue(value, 0, new WeakSet<object>());
}

function summarizeValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;

  const kind = typeof value;
  if (kind === 'string') return summarizeString(value as string);
  if (kind === 'number' || kind === 'boolean') return value;
  if (kind === 'function') return '[Function]';
  if (kind !== 'object') return String(value);

  if (isUint8Array(value)) {
    return { type: 'Uint8Array', bytes: value.length };
  }

  if (value instanceof Error) {
    const err = value as Error & { stack?: string };
    return {
      name: err.name,
      message: err.message,
      stack: typeof err.stack === 'string' ? summarizeString(err.stack) : undefined,
    };
  }

  if (depth >= MAX_DEPTH) {
    return summarizeObjectBoundary(value);
  }

  const obj = value as object;
  if (seen.has(obj)) return '[Circular]';
  seen.add(obj);

  if (Array.isArray(value)) {
    const arr = value as unknown[];
    const out: unknown[] = [];
    const limit = Math.min(arr.length, MAX_ARRAY_ITEMS);
    for (let i = 0; i < limit; i++) {
      out.push(summarizeValue(arr[i], depth + 1, seen));
    }
    if (arr.length > limit) {
      out.push({ omittedItems: arr.length - limit });
    }
    return { type: 'Array', length: arr.length, items: out };
  }

  const record = value as { [key: string]: unknown };
  const keys = Object.keys(record);
  const outRecord: { [key: string]: unknown } = {};
  const keyLimit = Math.min(keys.length, MAX_OBJECT_KEYS);
  for (let i = 0; i < keyLimit; i++) {
    const key = keys[i];
    outRecord[key] = summarizeValue(record[key], depth + 1, seen);
  }
  if (keys.length > keyLimit) {
    outRecord.__omittedKeys = keys.length - keyLimit;
  }
  return outRecord;
}

function summarizeString(value: string): unknown {
  if (value.length <= MAX_STRING_LENGTH) return value;
  return {
    type: 'string',
    chars: value.length,
    preview: value.slice(0, MAX_STRING_LENGTH),
  };
}

function summarizeObjectBoundary(value: unknown): unknown {
  if (Array.isArray(value)) return { type: 'Array', length: value.length };
  if (isUint8Array(value)) return { type: 'Uint8Array', bytes: value.length };
  const tag = Object.prototype.toString.call(value);
  return tag.length > 8 ? tag.slice(8, tag.length - 1) : 'Object';
}

function isUint8Array(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array || Object.prototype.toString.call(value) === '[object Uint8Array]';
}
