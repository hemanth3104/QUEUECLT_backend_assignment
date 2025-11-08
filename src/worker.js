import { getConfig } from './config.js';
import { claimJob, completeJob, failJobWithRetry, createWorker, markWorkerStopping, markWorkerStopped } from './models.js';
import { computeBackoffDelaySeconds, newId, nowISO, sleep } from './utils.js';
import { jobLogPath, log } from './logger.js';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { runCommandForJob } from './executor.js';

const PID_DIR = path.resolve('data', 'workers');
if (!fs.existsSync(PID_DIR)) fs.mkdirSync(PID_DIR, { recursive: true });

const workerId = newId();
const pidFile = path.join(PID_DIR, `${process.pid}.pid`);

let stopping = false;
process.on('SIGTERM', () => { stopping = true; markWorkerStopping(workerId); });
process.on('SIGINT', () => { stopping = true; markWorkerStopping(workerId); });

async function loop() {
  const pollMs = Number(getConfig('poll-interval-ms') || '500');
  createWorker({ id: workerId, pid: process.pid, started_at: nowISO() });
  fs.writeFileSync(pidFile, String(process.pid));

  log.info(`Worker ${workerId} started (pid=${process.pid}).`);

  while (!stopping) {
    const job = claimJob(workerId);

    if (!job) {
      await sleep(pollMs);
      continue;
    }

    const base = Number(getConfig('backoff-base') || '2');

    fs.appendFileSync(jobLogPath(job.id), `\n=== Job ${job.id} started at ${nowISO()} ===\nCommand: ${job.command}\n`);

    const res = await runCommandForJob(job);

    if (res.ok) {
      completeJob(job.id);
      fs.appendFileSync(jobLogPath(job.id), `=== Job ${job.id} completed at ${nowISO()} ===\n`);
    } else {
      const delaySec = computeBackoffDelaySeconds(base, job.attempts + 1);
      const out = failJobWithRetry({
        id: job.id,
        attempts: job.attempts,
        max_retries: job.max_retries,
        delaySeconds: delaySec,
        errorMessage: res.message
      });

      fs.appendFileSync(jobLogPath(job.id),
        `=== Job ${job.id} ${out.final ? 'DEAD' : 'failed'} at ${nowISO()} ===\nReason: ${res.message}\nNext delay: ${out.final ? 'n/a' : delaySec + 's'}\n`
      );
    }
  }

  markWorkerStopped(workerId);
  try { fs.unlinkSync(pidFile); } catch {}
  log.info(`Worker ${workerId} stopped.`);
  process.exit(0);
}

loop();