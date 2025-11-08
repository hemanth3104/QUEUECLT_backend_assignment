import { Command } from 'commander';
import { parseJobInput, newId, nowISO } from './utils.js';
import {
  upsertJob,
  listJobs,
  statusSummary,
  dlqList,
  dlqRetry,
  listWorkers,
  clearStoppedWorkers
} from './models.js';
import { getConfig, setConfig, listConfig } from './config.js';
import { log, jobLogPath } from './logger.js';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const program = new Command();
program
  .name('queuectl')
  .description('Background job queue with workers, retries, and DLQ')
  .version('1.0.0');

program
  .command('enqueue')
  .argument('<job-json>', 'JSON string for the job (at least "command")')
  .option('--id <id>', 'Provide a custom job id')
  .option('--max-retries <n>', 'Max retries', getConfig('max-retries') || '3')
  .option('--priority <n>', 'Lower number = higher priority', '100')
  .option('--timeout <sec>', 'Job timeout in seconds', '0')
  .option('--run-at <iso>', 'Schedule time (ISO) or "now"', 'now')
  .description('Add a new job to the queue')
  .action((json, opts) => {
    const payload = parseJobInput(json);
    const id = opts.id || payload.id || newId();

    if (!payload.command) throw new Error('Job must include "command"');
    const runAtRaw = opts.runAt ?? 'now';
    let run_at = nowISO();
    if (typeof runAtRaw === 'string' && runAtRaw.toLowerCase() !== 'now') {
      const d = new Date(runAtRaw);
      if (!Number.isNaN(d.getTime())) {
        run_at = d.toISOString();
      } else {
        log.warn(`Invalid --run-at value "${runAtRaw}", defaulting to now.`);
      }
    }

    const job = upsertJob({
      id,
      command: payload.command,
      state: 'pending',
      attempts: 0,
      max_retries: Number(opts.maxRetries ?? getConfig('max-retries') ?? '3'),
      priority: Number(opts.priority),
      timeout_seconds: Number(opts.timeout),
      run_at,
      created_at: nowISO(),
      updated_at: nowISO()
    });

    log.info('Enqueued job:', job.id);
    console.log(JSON.stringify(job, null, 2));
  });

const workerCmd = new Command('worker').description('Manage workers');

workerCmd
  .command('start')
  .description('Start one or more workers')
  .option('--count <n>', 'How many workers to start', '1')
  .action((opts) => {
    const count = Number(opts.count || '1');
    for (let i = 0; i < count; i++) {
      const child = spawn(process.execPath, [path.resolve('src', 'worker.js')], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
    }
    log.info(`Started ${count} worker(s).`);
  });

workerCmd
  .command('stop')
  .description('Stop running workers gracefully')
  .action(() => {
    const dir = path.resolve('data', 'workers');
    let stopped = 0;
    if (fs.existsSync(dir)) {
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.pid')) continue;
        const pid = Number(fs.readFileSync(path.join(dir, file), 'utf8'));
        try {
          process.kill(pid, 'SIGTERM');
          stopped++;
        } catch {
          // process might already be gone
        }
      }
    }
    log.info(`Signaled ${stopped} worker(s) to stop.`);
  });

program.addCommand(workerCmd);

program
  .command('status')
  .description('Show summary of job states & active workers')
  .action(() => {
    clearStoppedWorkers();
    const s = statusSummary();
    console.table(s.states);
    console.log('Active workers:', s.active_workers);
    const workers = listWorkers();
    if (workers.length) {
      console.log('\nWorkers:');
      for (const w of workers) {
        console.log(`- id=${w.id} pid=${w.pid} status=${w.status} started_at=${w.started_at}`);
      }
    }
  });

program
  .command('list')
  .option('--state <state>', 'Filter by state (pending|processing|completed|failed|dead)')
  .description('List jobs by state')
  .action((opts) => {
    const jobs = listJobs({ state: opts.state });
    console.log(JSON.stringify(jobs, null, 2));
  });

program
  .command('logs')
  .argument('<job-id>', 'Job id')
  .description('Print job output log')
  .action((jobId) => {
    const p = jobLogPath(jobId);
    if (fs.existsSync(p)) {
      process.stdout.write(fs.readFileSync(p));
    } else {
      log.warn('No logs for job', jobId);
    }
  });

program
  .command('dlq')
  .description('Dead Letter Queue operations')
  .argument('<action>', 'list | retry')
  .argument('[job-id]', 'required for "retry"')
  .action((action, jobId) => {
    if (action === 'list') {
      console.log(JSON.stringify(dlqList(), null, 2));
    } else if (action === 'retry') {
      if (!jobId) throw new Error('Provide a job id to retry from DLQ');
      const job = dlqRetry(jobId);
      if (!job) {
        log.warn(`Job ${jobId} not found in DLQ`);
      } else {
        log.info(`Re-enqueued ${jobId}`);
        console.log(JSON.stringify(job, null, 2));
      }
    } else {
      throw new Error('Unknown dlq action. Use: list | retry <job-id>');
    }
  });

program
  .command('config')
  .description('Manage configuration')
  .argument('<action>', 'get | set | list')
  .argument('[key]', 'config key for get/set')
  .argument('[value]', 'config value for set')
  .action((action, key, value) => {
    if (action === 'list') {
      console.log(JSON.stringify(listConfig(), null, 2));
      return;
    }
    if (action === 'get') {
      if (!key) throw new Error('Provide a key');
      console.log(getConfig(key));
      return;
    }
    if (action === 'set') {
      if (!key || value === undefined) throw new Error('Provide key and value');
      setConfig(key, value);
      log.info(`Set ${key}=${value}`);
      return;
    }
    throw new Error('Unknown config action');
  });

program.parse();