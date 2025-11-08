import db from './db.js';
import { nowISO } from './utils.js';

export function upsertJob(job) {
  const {
    id, command, state = 'pending', attempts = 0, max_retries = 3,
    priority = 100, timeout_seconds = 0, run_at = new Date().toISOString(),
    created_at = nowISO(), updated_at = nowISO(), last_error = null
  } = job;

  db.prepare(`
    INSERT INTO jobs (id, command, state, attempts, max_retries, priority, timeout_seconds, run_at, created_at, updated_at, last_error)
    VALUES (@id, @command, @state, @attempts, @max_retries, @priority, @timeout_seconds, @run_at, @created_at, @updated_at, @last_error)
    ON CONFLICT(id) DO UPDATE SET
      command=excluded.command,
      state=excluded.state,
      attempts=excluded.attempts,
      max_retries=excluded.max_retries,
      priority=excluded.priority,
      timeout_seconds=excluded.timeout_seconds,
      run_at=excluded.run_at,
      updated_at=excluded.updated_at,
      last_error=excluded.last_error
  `).run({ id, command, state, attempts, max_retries, priority, timeout_seconds, run_at, created_at, updated_at, last_error });

  return getJob(id);
}

export function getJob(id) {
  return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
}

export function listJobs({ state } = {}) {
  if (state) {
    return db.prepare('SELECT * FROM jobs WHERE state = ? ORDER BY created_at ASC').all(state);
  }
  return db.prepare('SELECT * FROM jobs ORDER BY created_at ASC').all();
}

export function statusSummary() {
  const states = db.prepare(`
    SELECT state, COUNT(*) as count FROM jobs GROUP BY state
  `).all();
  const workers = db.prepare(`
    SELECT COUNT(*) as count FROM workers WHERE status = 'running'
  `).get();
  const byState = Object.fromEntries(states.map(r => [r.state, r.count]));
  return { states: byState, active_workers: workers.count };
}

export function dlqList() {
  return db.prepare(`SELECT * FROM jobs WHERE state = 'dead' ORDER BY created_at ASC`).all();
}

export function dlqRetry(id) {
  const job = getJob(id);
  if (!job || job.state !== 'dead') return null;
  const updated = {
    ...job,
    state: 'pending',
    attempts: 0,
    last_error: null,
    run_at: nowISO(),
    updated_at: nowISO(),
    worker_id: null
  };
  upsertJob(updated);
  return getJob(id);
}

export function createWorker({ id, pid, started_at }) {
  db.prepare(`
    INSERT INTO workers (id, pid, started_at, status) VALUES (?, ?, ?, 'running')
  `).run(id, pid, started_at);
}

export function markWorkerStopping(id) {
  db.prepare(`UPDATE workers SET status='stopping' WHERE id = ?`).run(id);
}

export function markWorkerStopped(id) {
  db.prepare(`UPDATE workers SET status='stopped' WHERE id = ?`).run(id);
}

export function listWorkers() {
  return db.prepare('SELECT * FROM workers ORDER BY started_at ASC').all();
}

export function clearStoppedWorkers() {
  db.prepare(`DELETE FROM workers WHERE status = 'stopped'`).run();
}

/**
 * Atomically claim ONE eligible job for processing.
 * Picks by (priority ASC, created_at ASC).
 */
export function claimJob(workerId) {
  const now = nowISO();
  const row = db.prepare(`
    WITH picked AS (
      SELECT id FROM jobs
      WHERE state IN ('pending','failed') AND run_at <= ?
      ORDER BY priority ASC, created_at ASC
      LIMIT 1
    )
    UPDATE jobs
    SET state='processing', worker_id=?, updated_at=?
    WHERE id = (SELECT id FROM picked)
    RETURNING *
  `).get(now, workerId, now);

  return row || null;
}

export function completeJob(id) {
  const now = nowISO();
  db.prepare(`
    UPDATE jobs SET state='completed', updated_at=?, worker_id=NULL WHERE id=?
  `).run(now, id);
  return getJob(id);
}

export function failJobWithRetry({ id, attempts, max_retries, delaySeconds, errorMessage }) {
  const now = nowISO();
  const nextRun = new Date(Date.now() + delaySeconds * 1000).toISOString();
  const nextAttempts = attempts + 1;

  if (nextAttempts > max_retries) {
    db.prepare(`
      UPDATE jobs SET state='dead', attempts=?, last_error=?, updated_at=?, worker_id=NULL WHERE id=?
    `).run(nextAttempts, errorMessage?.slice(0, 2000) || 'failed', now, id);
    return { final: true, job: getJob(id) };
  } else {
    db.prepare(`
      UPDATE jobs SET state='failed', attempts=?, last_error=?, run_at=?, updated_at=? WHERE id=?
    `).run(nextAttempts, errorMessage?.slice(0, 2000) || 'failed', nextRun, now, id);
    return { final: false, job: getJob(id) };
  }
}