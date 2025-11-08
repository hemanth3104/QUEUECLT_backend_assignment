import db from './db.js';

const DEFAULTS = {
  'max-retries': '3',
  'backoff-base': '2',
  'poll-interval-ms': '500',
  'claim-batch-size': '1'
};

export function getConfig(key) {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  if (row) return row.value;
  return DEFAULTS[key];
}

export function setConfig(key, value) {
  db.prepare(`
    INSERT INTO config (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `).run(key, String(value));
}

export function listConfig() {
  const rows = db.prepare('SELECT key, value FROM config').all();
  const withDefaults = { ...DEFAULTS };
  for (const r of rows) withDefaults[r.key] = r.value;
  return withDefaults;
}