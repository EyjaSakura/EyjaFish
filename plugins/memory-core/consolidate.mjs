// Daily consolidation primitives. No DSH/bridge dependencies.
import { dedupeActiveNodes } from './store.mjs'
import { generateWindowNarrative } from './narrative.mjs'

const HOUR = 60 * 60 * 1000

export function closeStaleWindows(db, { now = Date.now(), staleMs = 2 * HOUR } = {}) {
  const cutoff = Number(now) - Number(staleMs)
  const rows = db.prepare(`SELECT w.window_id, MAX(t.ts) AS last_ts
    FROM windows w JOIN window_turns t ON t.window_id=w.window_id
    WHERE w.closed_at IS NULL
    GROUP BY w.window_id HAVING MAX(t.ts) < ?`).all(cutoff)
  const update = db.prepare("UPDATE windows SET closed_at=?, close_reason='stale' WHERE window_id=?")
  const tx = db.transaction(() => {
    for (const row of rows) update.run(Number(now), row.window_id)
  })
  tx()
  return rows.length
}

export function pruneStaleNodes(db, { now = Date.now(), olderThanDays = 90, importanceBelow = 0.3 } = {}) {
  const cutoff = Number(now) - Number(olderThanDays) * 24 * HOUR
  const result = db.prepare(`UPDATE nodes SET status='archived', superseded_by='prune:stale'
    WHERE status='active' AND type='event' AND owner_confirmed=0
      AND access_count=0 AND importance < ? AND created_at < ?`)
    .run(Number(importanceBelow), cutoff)
  return Number(result.changes)
}

const CONFLICT_PREDICATES = new Set([
  'port', 'path', 'model', 'version', 'config',
  'identity.name', 'identity.role', 'identity.claim',
  'prefers', 'dislikes', 'promise',
])

export function detectConflicts(db) {
  const rows = db.prepare(`SELECT subject,predicate,COUNT(*) AS n,GROUP_CONCAT(description,' | ') AS descriptions
    FROM nodes WHERE status='active' AND type='fact' AND predicate IS NOT NULL AND predicate<>''
    GROUP BY subject,predicate HAVING n>1 ORDER BY n DESC`).all()
  return rows.filter((row) => CONFLICT_PREDICATES.has(String(row.predicate)))
}

export async function runDaily(db, {
  now = Date.now(),
  apiKey = '',
  maxWindows = 20,
  allowLLM = true,
  fetchImpl = fetch,
  backupFile = '',
  dryRun = false,
} = {}) {
  const result = {
    closedWindows: 0,
    narratives: 0,
    narrativeSkipped: 0,
    narrativeErrors: 0,
    deduped: 0,
    pruned: 0,
    pending: 0,
    conflicts: 0,
    backupFile: '',
    dryRun: Boolean(dryRun),
  }
  if (backupFile && !dryRun) {
    await db.backup(backupFile)
    result.backupFile = backupFile
  }
  if (dryRun) return result

  result.closedWindows = closeStaleWindows(db, { now })
  const windows = db.prepare(`SELECT window_id FROM windows
    WHERE closed_at IS NOT NULL AND narrative_status='pending'
    ORDER BY closed_at ASC LIMIT ?`).all(Number(maxWindows))
  for (const row of windows) {
    try {
      const narrative = await generateWindowNarrative(db, row.window_id, { now, apiKey, allowLLM, fetchImpl })
      if (narrative.ok && !narrative.skipped) result.narratives += 1
      else result.narrativeSkipped += 1
    } catch {
      result.narrativeErrors += 1
    }
  }
  const dedupe = dedupeActiveNodes(db)
  result.deduped = dedupe.archived
  result.pruned = pruneStaleNodes(db, { now })
  result.pending = Number(db.prepare("SELECT COUNT(*) AS n FROM nodes WHERE status='pending'").get().n)
  result.conflicts = detectConflicts(db).length
  return result
}
