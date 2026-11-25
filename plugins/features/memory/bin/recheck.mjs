// Daily environment recheck. Writes status.json but never imports store statically,
// so it still runs when better-sqlite3 or the DB is broken.
import { createRequire } from 'node:module'
import { envprobe } from '../../../memory-core/index.mjs'
import { readStatus, writeStatus, today } from '../status.js'

const requireFn = createRequire(new URL('../../../memory-core/index.mjs', import.meta.url))
const probe = envprobe({ checkSqlite: true, requireFn })
const status = readStatus()
const now = Date.now()
let changed = false
if (probe.ok && status.mode === 'degraded') {
  status.mode = 'shadow'
  status.reason = ''
  status.recoveredAt = now
  status.lastCheckAt = now
  status.lastCheckOk = true
  status.lastRecoveredNotifiedDate = ''
  changed = true
} else if (!probe.ok && status.mode !== 'degraded' && status.mode !== 'off') {
  status.mode = 'degraded'
  status.reason = probe.reason || 'envprobe failed'
  status.degradedAt = now
  status.lastCheckAt = now
  status.lastCheckOk = false
  changed = true
} else {
  status.lastCheckAt = now
  status.lastCheckOk = Boolean(probe.ok)
}

if (changed) writeStatus(status)
process.stdout.write(JSON.stringify({
  ok: Boolean(probe.ok),
  changed,
  mode: status.mode,
  reason: status.reason || '',
  probe,
  date: today(now),
}, null, 2) + '\n')
process.exitCode = probe.ok ? 0 : 1
