// Stage 2 ranking: BM25 + entity + recency + importance, deterministic.
import { searchCandidates } from './store.mjs'
import { extractEntities } from './extract.mjs'

function parseEntities(value) {
  try {
    const parsed = JSON.parse(value ?? '[]')
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch { return [] }
}

function entityOverlap(queryEntities, nodeEntities) {
  if (queryEntities.length === 0 || nodeEntities.length === 0) return 0
  const set = new Set(nodeEntities)
  return queryEntities.filter((e) => set.has(e)).length / Math.max(1, queryEntities.length)
}

/**
 * @param {any} db
 * @param {{ subject?: string, query?: string, limit?: number, now?: number }} [options]
 */
export function rankCandidates(db, { subject, query = '', limit = 8, now = Date.now() } = {}) {
  if (!db || !subject) return []
  const rows = searchCandidates(db, query, { subject, limit: Math.max(limit * 4, 20) })
  if (rows.length === 0) return []
  const raws = rows.map((row) => (row.bm25 == null ? null : -Number(row.bm25))).filter((n) => n != null)
  const rawMax = raws.length ? Math.max(...raws) : 0
  const rawMin = raws.length ? Math.min(...raws) : 0
  const queryEntities = extractEntities(query)
  const ranked = rows.map((row) => {
    const raw = row.bm25 == null ? null : -Number(row.bm25)
    const rel = raw == null || rawMax === rawMin ? 0 : (raw - rawMin) / (rawMax - rawMin + 1e-9)
    const entity = entityOverlap(queryEntities, parseEntities(row.entities_json))
    const created = Number(row.created_at) || now
    const ageDays = Math.max(0, now - created) / 86_400_000
    const rec = Math.pow(0.5, ageDays / 30)
    const imp = Number(row.importance) || 0.5
    return {
      ...row,
      rel: Number((0.7 * rel + 0.3 * entity).toFixed(4)),
      score: Number((0.6 * rel + 0.3 * rec + 0.1 * imp + 0.3 * entity).toFixed(4)),
    }
  })
  ranked.sort((a, b) => b.score - a.score)
  return ranked.slice(0, limit)
}

export function touchCandidates(db, rows, now = Date.now()) {
  if (!db || !Array.isArray(rows) || rows.length === 0) return
  const stmt = db.prepare('UPDATE nodes SET access_count=COALESCE(access_count,0)+1,last_accessed_at=? WHERE id=?')
  const tx = db.transaction(() => { for (const row of rows) stmt.run(now, row.id) })
  try { tx() } catch { /* best-effort */ }
}
