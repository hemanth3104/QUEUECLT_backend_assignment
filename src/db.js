import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve('data');
const DB_PATH = path.join(DATA_DIR, 'queue.db');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH, { fileMustExist: false, timeout: 60000 });
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  command TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending','processing','completed','failed','dead')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  priority INTEGER NOT NULL DEFAULT 100,
  timeout_seconds INTEGER NOT NULL DEFAULT 0,
  run_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_error TEXT,
  worker_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_state_runat ON jobs (state, run_at, priority, created_at);

CREATE TABLE IF NOT EXISTS workers (
  id TEXT PRIMARY KEY,
  pid INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running','stopping','stopped'))
);

CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

export default db;
