// Archive internal/system wrapper nodes that should never be recalled as memory.
// Usage: node bin/archive-internal.mjs [--apply]
import { openStore, closeStore, DEFAULT_DB } from '../index.mjs'

const apply = process.argv.includes('--apply')
const db = openStore(DEFAULT_DB)
const where = `status <> 'archived' AND (
  description LIKE '【系统】%' OR
  description LIKE '【注入%' OR
  description LIKE '【自动%' OR
  description LIKE '【提醒%' OR
  description LIKE '【视频分析完成】%' OR
  description LIKE '【抖音私信】%'
)`
// Legacy engineering handoff events are not personal/fish memories.
const legacyWhere = `status <> 'archived' AND source='legacy' AND subject='小鲸鱼'`
const rows = db.prepare(`SELECT id,substr(description,1,80) d FROM nodes WHERE ${where}`).all()
const legacyRows = db.prepare(`SELECT COUNT(*) n FROM nodes WHERE ${legacyWhere}`).get().n
const internalTurns = db.prepare(`SELECT COUNT(*) n FROM window_turns WHERE role='user' AND (text LIKE '【系统】%' OR text LIKE '【抖音私信】%' OR text LIKE '【视频分析完成】%' OR text LIKE '【注入%')`).get().n
console.log(JSON.stringify({ apply, count: rows.length, legacyEngineering: legacyRows, internalWindowTurns: internalTurns, samples: rows.slice(0, 10) }, null, 2))
if (apply) {
  const result = db.prepare(`UPDATE nodes SET status='archived', superseded_by='internal-filter' WHERE ${where}`).run()
  const legacy = db.prepare(`UPDATE nodes SET status='archived', superseded_by='legacy-engineering-filter' WHERE ${legacyWhere}`).run()
  const turns = db.prepare(`DELETE FROM window_turns WHERE role='user' AND (text LIKE '【系统】%' OR text LIKE '【抖音私信】%' OR text LIKE '【视频分析完成】%' OR text LIKE '【注入%')`).run()
  console.log(JSON.stringify({ archived: result.changes, archivedLegacy: legacy.changes, deletedWindowTurns: turns.changes }))
}
closeStore(db)
