// One-shot stage 1 migration CLI. Run manually after the env gate.
import { openStore, closeStore, migrateLegacy, count, DEFAULT_DB } from './index.mjs'

const db = openStore(DEFAULT_DB)
try {
  const result = migrateLegacy(db)
  console.log(JSON.stringify({ db: DEFAULT_DB, result, nodes: count(db, 'nodes') }))
} finally {
  closeStore(db)
}
