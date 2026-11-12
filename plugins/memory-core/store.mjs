// Pure SQLite store for memory-core stage 1. No DSH/bridge imports.
import Database from 'better-sqlite3'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { buildTokens } from './tokenize.mjs'

export const SCHEMA_VERSION = 1
export const DEFAULT_DB = 'D:\\DSH\\qqbot\\data\\memory\\memory.db'

const LOW_RISK_PREDICATES = new Set([
  'config', 'port', 'path', 'model', 'version', 'identity.name', 'identity.role',
])

const SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS nodes (
  row_id INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  subject TEXT NOT NULL,
  predicate TEXT,
  epistemic TEXT NOT NULL DEFAULT 'normal',
  description TEXT NOT NULL,
  description_tokens TEXT NOT NULL DEFAULT '',
  triple_json TEXT,
  entities_json TEXT NOT NULL DEFAULT '[]',
  raw_quote TEXT,
  raw_quote_tokens TEXT NOT NULL DEFAULT '',
  importance REAL DEFAULT 0.5,
  arousal REAL DEFAULT 0.0,
  valence REAL DEFAULT 0.0,
  confidence REAL DEFAULT 0.8,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  supersedes_json TEXT,
  superseded_by TEXT,
  dedup_key TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  last_accessed_at INTEGER,
  access_count INTEGER DEFAULT 0,
  half_life_days REAL NOT NULL DEFAULT 30,
  window_id TEXT,
  is_hypothetical INTEGER DEFAULT 0,
  time_scope TEXT DEFAULT 'permanent',
  owner_confirmed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_nodes_subject ON nodes(subject, status);
CREATE INDEX IF NOT EXISTS idx_nodes_predicate ON nodes(subject, predicate, status);
CREATE INDEX IF NOT EXISTS idx_nodes_status ON nodes(status);
CREATE TABLE IF NOT EXISTS node_entities (
  node_id TEXT NOT NULL,
  entity TEXT NOT NULL,
  PRIMARY KEY (node_id, entity)
);
CREATE INDEX IF NOT EXISTS idx_node_entities_entity ON node_entities(entity);
CREATE TABLE IF NOT EXISTS window_turns (
  window_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  turn_index INTEGER NOT NULL,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  ts INTEGER NOT NULL,
  PRIMARY KEY (window_id, turn_index, role)
);
CREATE TABLE IF NOT EXISTS turn_decisions (
  window_id TEXT NOT NULL,
  turn_index INTEGER NOT NULL,
  decision TEXT NOT NULL,
  reason TEXT,
  rescan_at INTEGER,
  PRIMARY KEY (window_id, turn_index)
);
CREATE TABLE IF NOT EXISTS ingest_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  turn_key TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ingest_dead_letter (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  turn_key TEXT,
  payload_json TEXT,
  error TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS windows (
  window_id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  opened_at INTEGER,
  closed_at INTEGER,
  close_reason TEXT,
  narrative_status TEXT DEFAULT 'pending'
);
CREATE TABLE IF NOT EXISTS consolidation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  started_at INTEGER NOT NULL,
  expires_at INTEGER,
  payload_json TEXT,
  error TEXT
);
CREATE TABLE IF NOT EXISTS system_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
  description_tokens,
  raw_quote_tokens,
  content='nodes',
  content_rowid='row_id',
  tokenize='unicode61'
);
CREATE TRIGGER IF NOT EXISTS nodes_ai AFTER INSERT ON nodes BEGIN
  INSERT INTO nodes_fts(rowid, description_tokens, raw_quote_tokens)
  VALUES (new.row_id, new.description_tokens, new.raw_quote_tokens);
END;
CREATE TRIGGER IF NOT EXISTS nodes_ad AFTER DELETE ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, description_tokens, raw_quote_tokens)
  VALUES ('delete', old.row_id, old.description_tokens, old.raw_quote_tokens);
END;
CREATE TRIGGER IF NOT EXISTS nodes_au AFTER UPDATE OF description_tokens, raw_quote_tokens ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, description_tokens, raw_quote_tokens)
  VALUES ('delete', old.row_id, old.description_tokens, old.raw_quote_tokens);
  INSERT INTO nodes_fts(rowid, description_tokens, raw_quote_tokens)
  VALUES (new.row_id, new.description_tokens, new.raw_quote_tokens);
END;
`

export function openStore(file = DEFAULT_DB) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.exec(SCHEMA)
  const row = db.prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1').get()
  if (!row) db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(SCHEMA_VERSION, Date.now())
  return db
}

export function closeStore(db) {
  try { db.close() } catch { /* ignore */ }
}

export function addNode(db, node) {
  const description = String(node.description ?? '').trim()
  if (description === '') throw new Error('description is required')
  const id = String(node.id ?? `n-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`)
  const descriptionTokens = node.description_tokens ?? buildTokens(description)
  const rawQuote = String(node.raw_quote ?? '')
  const rawTokens = node.raw_quote_tokens ?? buildTokens(rawQuote)
  const entities = Array.isArray(node.entities) ? node.entities : []
  const now = Number(node.created_at) || Date.now()
  const insert = db.prepare(`INSERT INTO nodes (
    id,type,subject,predicate,epistemic,description,description_tokens,triple_json,entities_json,
    raw_quote,raw_quote_tokens,importance,arousal,valence,confidence,source,status,supersedes_json,
    superseded_by,dedup_key,created_at,last_accessed_at,access_count,half_life_days,window_id,
    is_hypothetical,time_scope,owner_confirmed
  ) VALUES (@id,@type,@subject,@predicate,@epistemic,@description,@description_tokens,@triple_json,@entities_json,
    @raw_quote,@raw_quote_tokens,@importance,@arousal,@valence,@confidence,@source,@status,@supersedes_json,
    @superseded_by,@dedup_key,@created_at,@last_accessed_at,@access_count,@half_life_days,@window_id,
    @is_hypothetical,@time_scope,@owner_confirmed)`)
  try {
    const result = insert.run({
      id,
      type: node.type ?? 'event',
      subject: node.subject ?? 'legacy',
      predicate: node.predicate ?? null,
      epistemic: node.epistemic ?? 'normal',
      description,
      description_tokens: descriptionTokens,
      triple_json: node.triple ? JSON.stringify(node.triple) : (node.triple_json ?? null),
      entities_json: JSON.stringify(entities),
      raw_quote: rawQuote,
      raw_quote_tokens: rawTokens,
      importance: Number(node.importance) || 0.5,
      arousal: Number(node.arousal) || 0,
      valence: Number(node.valence) || 0,
      confidence: Number(node.confidence) || 0.8,
      source: node.source ?? 'user_message',
      status: node.status ?? 'active',
      supersedes_json: node.supersedes ? JSON.stringify(node.supersedes) : null,
      superseded_by: node.superseded_by ?? null,
      dedup_key: node.dedup_key ?? null,
      created_at: now,
      last_accessed_at: node.last_accessed_at ?? null,
      access_count: node.access_count ?? 0,
      half_life_days: Number(node.half_life_days) || 30,
      window_id: node.window_id ?? null,
      is_hypothetical: node.is_hypothetical ? 1 : 0,
      time_scope: node.time_scope ?? 'permanent',
      owner_confirmed: node.owner_confirmed ? 1 : 0,
    })
    const entityInsert = db.prepare('INSERT OR IGNORE INTO node_entities(node_id, entity) VALUES (?, ?)')
    for (const entity of entities) entityInsert.run(id, String(entity))
    // Low-risk fact supersession only; sensitive predicates stay pending.
    if (node.type === 'fact' && node.predicate && node.status !== 'pending' && LOW_RISK_PREDICATES.has(String(node.predicate))) {
      const old = db.prepare(`SELECT id FROM nodes WHERE subject=? AND predicate=? AND status='active' AND id<>? ORDER BY created_at DESC LIMIT 1`)
        .get(String(node.subject ?? ''), String(node.predicate), id)
      if (old) {
        db.prepare(`UPDATE nodes SET status='superseded', superseded_by=?, last_accessed_at=? WHERE id=?`)
          .run(id, now, old.id)
        db.prepare(`UPDATE nodes SET supersedes_json=? WHERE id=?`)
          .run(JSON.stringify([old.id]), id)
      }
    }
    return { id, rowId: Number(result.lastInsertRowid), inserted: true }
  } catch (error) {
    if (String(error?.code).includes('SQLITE_CONSTRAINT') || String(error?.message).includes('UNIQUE')) {
      const existing = node.dedup_key
        ? db.prepare('SELECT id FROM nodes WHERE dedup_key = ?').get(node.dedup_key)
        : db.prepare('SELECT id FROM nodes WHERE id = ?').get(id)
      if (existing) return { id: existing.id, inserted: false }
    }
    throw error
  }
}

export function addWindowTurn(db, { windowId, subject, index, role, text, ts }) {
  db.prepare(`INSERT OR REPLACE INTO window_turns(window_id,subject,turn_index,role,text,ts)
    VALUES (?,?,?,?,?,?)`).run(String(windowId), String(subject), Number(index), String(role), String(text), Number(ts) || Date.now())
}

export function setDecision(db, { windowId, index, decision, reason = '', rescanAt = null }) {
  db.prepare(`INSERT OR REPLACE INTO turn_decisions(window_id,turn_index,decision,reason,rescan_at)
    VALUES (?,?,?,?,?)`).run(String(windowId), Number(index), String(decision), String(reason), rescanAt)
}

export function enqueue(db, { turnKey, payload }) {
  const result = db.prepare(`INSERT OR IGNORE INTO ingest_queue(turn_key,payload_json,status,created_at)
    VALUES (?,?,?,?)`).run(String(turnKey), JSON.stringify(payload ?? {}), 'queued', Date.now())
  return { id: Number(result.lastInsertRowid), queued: result.changes > 0 }
}

export function searchCandidates(db, query, { subject = null, limit = 20 } = {}) {
  const tokens = buildTokens(query)
  const hits = []
  if (tokens !== '') {
    const match = tokens.split(/\s+/).map((t) => `"${t.replace(/"/g, '')}"`).join(' OR ')
    try {
      const rows = db.prepare(`SELECT n.id,n.subject,n.description,n.entities_json,n.created_at,n.importance,
        bm25(nodes_fts) AS bm25
        FROM nodes_fts JOIN nodes n ON n.row_id = nodes_fts.rowid
        WHERE nodes_fts MATCH ? AND n.status='active' ${subject ? 'AND n.subject=?' : ''}
        ORDER BY bm25 LIMIT ?`).all(...(subject ? [match, subject, limit] : [match, limit]))
      for (const row of rows) hits.push({ ...row, source: 'fts' })
    } catch { /* FTS query can fail on punctuation; entity path still works */ }
  }
  if (subject) {
    const entities = [...new Set((query.match(/[A-Za-z0-9_:.-]{2,}|[\u4e00-\u9fff]{2,}/g) ?? []))]
    if (entities.length > 0) {
      const placeholders = entities.map(() => '?').join(',')
      const rows = db.prepare(`SELECT n.id,n.subject,n.description,n.entities_json,n.created_at,n.importance
        FROM nodes n JOIN node_entities e ON e.node_id=n.id
        WHERE n.status='active' AND n.subject=? AND e.entity IN (${placeholders}) LIMIT ?`)
        .all(subject, ...entities, limit)
      for (const row of rows) hits.push({ ...row, source: 'entity' })
    }
  }
  const seen = new Set()
  return hits.filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)))
}

export function listPending(db, limit = 50) {
  return db.prepare(`SELECT id,type,subject,predicate,description,source,created_at
    FROM nodes WHERE status='pending' ORDER BY created_at DESC LIMIT ?`).all(limit)
}

export function confirmNode(db, id, approve = true) {
  const node = db.prepare('SELECT id FROM nodes WHERE id=?').get(String(id))
  if (!node) return { ok: false, reason: 'not-found' }
  db.prepare(`UPDATE nodes SET status=?, owner_confirmed=? WHERE id=?`)
    .run(approve ? 'active' : 'archived', approve ? 1 : 0, String(id))
  return { ok: true, id: String(id), status: approve ? 'active' : 'archived' }
}

export function count(db, table) {
  return Number(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n)
}
