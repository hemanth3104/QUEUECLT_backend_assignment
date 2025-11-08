import { exec } from 'node:child_process';
import { appendJobLog } from './logger.js';

export function runCommandForJob(job) {
  const { id, command, timeout_seconds } = job;

  return new Promise((resolve) => {
    const child = exec(command, { timeout: timeout_seconds > 0 ? timeout_seconds * 1000 : 0 }, (error, stdout, stderr) => {
      if (stdout) appendJobLog(id, stdout);
      if (stderr) appendJobLog(id, stderr);

      if (error) {
        const msg = error.killed
          ? `Timeout after ${timeout_seconds}s`
          : `Exit code ${error.code}${error.signal ? ` (signal ${error.signal})` : ''}`;
        return resolve({ ok: false, message: msg });
      }
      resolve({ ok: true });
    });

    if (child.stdout) child.stdout.on('data', chunk => appendJobLog(id, chunk));
    if (child.stderr) child.stderr.on('data', chunk => appendJobLog(id, chunk));
  });
}