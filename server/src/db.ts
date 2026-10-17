import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/**
 * Persistence layer for QUOTIENT.
 *
 * Uses Node's built-in `node:sqlite` (stable since Node 22.5) so the project
 * has zero native build steps and clones reproducibly on any machine.
 */

export type Allocation = {
  id: string
  name: string
  team: string
  workload: string
  model: string
  status: 'active' | 'suspended' | 'archived' | 'pending_review'
  tokens_granted: number
  tokens_used: number
  unit_cost_micros: number
  owner: string
  risk_tier: 'low' | 'moderate' | 'elevated' | 'ceremonial'
  created_at: string
  updated_at: string
}

export type Attestation = {
  id: string
  allocation_id: string
  period: string
  state: 'draft' | 'pending_secondary' | 'certified'
  control_number: string
  attestor: string
  secondary_phrase: string | null
  created_at: string
  certified_at: string | null
}

export type AuditEvent = {
  id: number
  ts: string
  actor: string
  kind: string
  summary: string
  detail: string
}

export type Notification = {
  id: number
  key: string
  tier: number
  body: string
  dismissed_count: number
  muted: number
  created_at: string
  last_shown_at: string | null
}

export type ChatMessage = {
  id: number
  session_id: string
  role: 'user' | 'arbiter'
  content: string
  page_context: string | null
  created_at: string
}

export type Receipt = {
  id: number
  control_number: string
  subject: string
  body: string
  created_at: string
}

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS allocations (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  team             TEXT NOT NULL,
  workload         TEXT NOT NULL,
  model            TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('active','suspended','archived','pending_review')),
  tokens_granted   INTEGER NOT NULL CHECK (tokens_granted >= 0),
  tokens_used      INTEGER NOT NULL CHECK (tokens_used >= 0),
  unit_cost_micros INTEGER NOT NULL CHECK (unit_cost_micros >= 0),
  owner            TEXT NOT NULL,
  risk_tier        TEXT NOT NULL CHECK (risk_tier IN ('low','moderate','elevated','ceremonial')),
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attestations (
  id               TEXT PRIMARY KEY,
  allocation_id    TEXT NOT NULL REFERENCES allocations(id) ON DELETE CASCADE,
  period           TEXT NOT NULL,
  state            TEXT NOT NULL CHECK (state IN ('draft','pending_secondary','certified')),
  control_number   TEXT NOT NULL,
  attestor         TEXT NOT NULL,
  secondary_phrase TEXT,
  created_at       TEXT NOT NULL,
  certified_at     TEXT
);

CREATE TABLE IF NOT EXISTS audit_events (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      TEXT NOT NULL,
  actor   TEXT NOT NULL,
  kind    TEXT NOT NULL,
  summary TEXT NOT NULL,
  detail  TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS notifications (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  key             TEXT NOT NULL UNIQUE,
  tier            INTEGER NOT NULL DEFAULT 0,
  body            TEXT NOT NULL,
  dismissed_count INTEGER NOT NULL DEFAULT 0,
  muted           INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  last_shown_at   TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('user','arbiter')),
  content      TEXT NOT NULL,
  page_context TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS receipts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  control_number TEXT NOT NULL UNIQUE,
  subject        TEXT NOT NULL,
  body           TEXT NOT NULL,
  created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_ts        ON audit_events(ts DESC);
CREATE INDEX IF NOT EXISTS idx_chat_session    ON chat_messages(session_id, id);
CREATE INDEX IF NOT EXISTS idx_attest_alloc    ON attestations(allocation_id);
`

export function openDatabase(path?: string): DatabaseSync {
  const raw = path ?? process.env.DATABASE_PATH ?? new URL('../data/quotient-v2.db', import.meta.url).pathname
  const file = raw === ':memory:' ? raw : resolve(raw)
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec(SCHEMA)
  return db
}

/** Defaults for every tunable the Console exposes. */
export const DEFAULT_SETTINGS: Record<string, string> = {
  theme: 'dark',
  theme_authorised: 'false',
  density: 'comfortable',
  verbose_audit_banner: 'false',
  reduce_motion: 'false',
  decorative_transitions: 'true',
  interlocks_overridden: 'false',
  literal_search: 'true',
  filter_interpretation: 'policy',
  sort: 'uuid_alpha',
  consent_state: 'unanswered',
  notifications_muted: 'false',
  session_mode: 'guest',
}

export function readSettings(db: DatabaseSync): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const out = { ...DEFAULT_SETTINGS }
  for (const r of rows) out[r.key] = r.value
  return out
}

export function writeSetting(db: DatabaseSync, key: string, value: string): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, value)
}

export function logEvent(
  db: DatabaseSync,
  kind: string,
  summary: string,
  detail: Record<string, unknown> = {},
  actor = 'demo.operator@quotient.cloud',
): void {
  db.prepare('INSERT INTO audit_events (ts, actor, kind, summary, detail) VALUES (?, ?, ?, ?, ?)').run(
    new Date().toISOString(),
    actor,
    kind,
    summary,
    JSON.stringify(detail),
  )
}

/** Document control numbers. Deliberately, gloriously over-specified. */
export function controlNumber(prefix: string, n: number): string {
  return `${prefix}-${String(new Date().getFullYear())}-${String(n).padStart(5, '0')}-REV.A`
}
