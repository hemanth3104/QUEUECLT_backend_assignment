import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';

const LOG_DIR = path.resolve('data', 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

export function jobLogPath(jobId) {
  return path.join(LOG_DIR, `${jobId}.log`);
}

export function appendJobLog(jobId, text) {
  fs.appendFileSync(jobLogPath(jobId), text);
}

export const log = {
  info: (...a) => console.log(chalk.cyan('[queuectl]'), ...a),
  warn: (...a) => console.warn(chalk.yellow('[queuectl]'), ...a),
  error: (...a) => console.error(chalk.red('[queuectl]'), ...a),
};