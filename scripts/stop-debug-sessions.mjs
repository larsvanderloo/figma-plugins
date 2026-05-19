import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const rootDir = process.cwd();
const currentPid = process.pid;

const DEBUG_PATTERNS = [
  /\bnpm run debug:session\b/,
  /\bnpm run debug:watch\b/,
  /\bnpm run debug:logs\b/,
  /\bnpm run watch\b/,
  /\bvite build --watch\b/,
  /\besbuild\.config\.mjs --watch\b/,
  /\bdebug-log-server\.mjs\b/,
  /\bwrite-debug-manifests\.mjs --watch\b/,
  /\bwrite-app-version\.mjs --watch\b/,
];

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function listProcesses() {
  const { stdout } = await execFileAsync('ps', ['-axo', 'pid=,ppid=,command=']);
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(.+)$/);
      if (match === null) return null;
      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        command: match[3],
      };
    })
    .filter(Boolean);
}

function buildAncestorSet(processes) {
  const byPid = new Map(processes.map((processInfo) => [processInfo.pid, processInfo]));
  const ancestors = new Set([currentPid]);
  let cursor = byPid.get(currentPid);
  while (cursor !== undefined && cursor.ppid > 0 && !ancestors.has(cursor.ppid)) {
    ancestors.add(cursor.ppid);
    cursor = byPid.get(cursor.ppid);
  }
  return ancestors;
}

async function readProcessCwd(pid) {
  try {
    const { stdout } = await execFileAsync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']);
    const cwdLine = stdout
      .split('\n')
      .find((line) => line.startsWith('n'));
    return cwdLine === undefined ? null : cwdLine.slice(1);
  } catch (_error) {
    return null;
  }
}

async function isRepoProcess(processInfo) {
  if (processInfo.command.includes(rootDir)) return true;
  const cwd = await readProcessCwd(processInfo.pid);
  return cwd !== null && (cwd === rootDir || cwd.startsWith(rootDir + '/'));
}

async function findDebugProcesses() {
  const processes = await listProcesses();
  const ancestors = buildAncestorSet(processes);
  const candidates = processes.filter((processInfo) => {
    if (ancestors.has(processInfo.pid)) return false;
    return DEBUG_PATTERNS.some((pattern) => pattern.test(processInfo.command));
  });

  const matches = [];
  for (const candidate of candidates) {
    if (await isRepoProcess(candidate)) {
      matches.push(candidate);
    }
  }
  return matches.sort((a, b) => b.pid - a.pid);
}

function signalProcesses(processes, signal) {
  for (const processInfo of processes) {
    try {
      process.kill(processInfo.pid, signal);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ESRCH') {
        continue;
      }
      console.warn(`[debug-stop] failed to send ${signal} to ${processInfo.pid}:`, error);
    }
  }
}

const matches = await findDebugProcesses();
if (matches.length === 0) {
  console.log('[debug-stop] no active debug/watch processes found');
  process.exit(0);
}

console.log('[debug-stop] stopping active debug/watch processes:');
for (const match of matches) {
  console.log(`  ${match.pid} ${match.command}`);
}

signalProcesses(matches, 'SIGTERM');
await sleep(1200);

const remaining = await findDebugProcesses();
if (remaining.length > 0) {
  console.warn('[debug-stop] forcing remaining debug/watch processes:');
  for (const match of remaining) {
    console.warn(`  ${match.pid} ${match.command}`);
  }
  signalProcesses(remaining, 'SIGKILL');
}

console.log('[debug-stop] done');
