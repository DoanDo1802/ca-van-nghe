import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function startPotServer() {
  const entry = resolve('.bin/bgutil-pot/server/build/main.js');
  if (!existsSync(entry)) {
    console.warn('[pot-server] build/main.js not found, skipping PO Token server');
    return null;
  }

  const port = String(process.env.POT_SERVER_PORT || 4416);
  console.log(`[pot-server] Starting PO Token server on 127.0.0.1:${port}...`);
  const child = spawn(process.execPath, [entry, '--host', '127.0.0.1', '--port', port], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let loggedLines = 0;
  const logOutput = (chunk) => {
    const text = chunk.toString();
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      if (loggedLines < 30 || /error|err|warn|listen|ready|port/i.test(line)) {
        loggedLines++;
        console.log(`[pot-server] ${line}`);
      }
    }
  };

  child.stdout?.on('data', logOutput);
  child.stderr?.on('data', logOutput);
  child.on('error', (err) => {
    console.warn('[pot-server] Failed to start:', err.message);
  });
  child.on('exit', (code, signal) => {
    console.warn(`[pot-server] Exited with code=${code} signal=${signal}`);
  });

  return {
    stop() {
      if (!child.killed) child.kill('SIGTERM');
    },
  };
}
