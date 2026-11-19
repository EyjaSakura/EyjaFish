// Archive exact duplicate active nodes. Usage: node bin/dedupe-active.mjs [--apply]
import { openStore, closeStore, dedupeActiveNodes, DEFAULT_DB } from '../index.mjs'
const apply = process.argv.includes('--apply')
const db = openStore(DEFAULT_DB)
try {
  const dry = dedupeActiveNodes(db, { dryRun: true })
  const result = apply ? dedupeActiveNodes(db) : dry
  console.log(JSON.stringify({ apply, groups: result.groups, archived: result.archived }))
} finally {
  closeStore(db)
}
