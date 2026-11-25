// Archive obvious receipt/filler nodes that predate the quality gate.
// Default is dry-run; pass --apply to write.
import { openStore, closeStore } from '../store.mjs'
import { isTrivialMemory } from '../quality.mjs'

const apply = process.argv.includes('--apply')
const db = openStore()
try {
  const rows = db.prepare("SELECT id,subject,description,type FROM nodes WHERE status='active'").all()
  const hits = rows.filter((row) => isTrivialMemory(row.description))
  if (apply) {
    const stmt = db.prepare("UPDATE nodes SET status='archived', superseded_by='quality:trivial' WHERE id=?")
    const tx = db.transaction(() => { for (const row of hits) stmt.run(row.id) })
    tx()
  }
  console.log(JSON.stringify({ apply, scanned: rows.length, matched: hits.length, samples: hits.slice(0, 20) }, null, 2))
} finally {
  closeStore(db)
}
