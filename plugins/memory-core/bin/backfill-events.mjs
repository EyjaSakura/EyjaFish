// Backfill event nodes from real user turns retained in window_turns.
// Usage: node bin/backfill-events.mjs [--apply]
import { openStore, closeStore, addNode, DEFAULT_DB } from '../index.mjs'
import { isInternalText, isMemoryEvent } from '../extract.mjs'

const apply = process.argv.includes('--apply')
const db = openStore(DEFAULT_DB)
const rows = db.prepare(`SELECT window_id,subject,turn_index,text,ts FROM window_turns
  WHERE role='user' ORDER BY ts ASC`).all()
const candidates = rows.filter((row) => isMemoryEvent(row.text) && !isInternalText(row.text))
console.log(JSON.stringify({ apply, totalTurns: rows.length, candidates: candidates.length }, null, 2))
let inserted = 0
if (apply) {
  for (const row of candidates) {
    const result = addNode(db, {
      id: `wt-${row.window_id}-${row.turn_index}`,
      type: 'event',
      subject: row.subject,
      description: String(row.text).slice(0, 1000),
      raw_quote: String(row.text).slice(0, 1000),
      source: 'window_backfill',
      status: 'active',
      dedup_key: `wt:${row.window_id}:${row.turn_index}`,
      window_id: row.window_id,
      created_at: Number(row.ts) || Date.now(),
      owner_confirmed: 1,
    })
    if (result.inserted) inserted += 1
  }
}
console.log(JSON.stringify({ inserted }))
closeStore(db)
