// memory-core admin CLI (stage 1): pending identity facts only.
import { openStore, closeStore, listPending, confirmNode, DEFAULT_DB } from './index.mjs'

const args = process.argv.slice(2)
const db = openStore(DEFAULT_DB)
try {
  if (args.includes('--list-pending')) {
    console.log(JSON.stringify(listPending(db, 100), null, 2))
  } else {
    const id = args.find((x) => !x.startsWith('--'))
    if (!id) {
      console.error('usage: node admin.mjs --list-pending | --confirm <id> | --reject <id>')
      process.exitCode = 2
    } else {
      const approve = !args.includes('--reject')
      console.log(JSON.stringify(confirmNode(db, id, approve)))
    }
  }
} finally {
  closeStore(db)
}
