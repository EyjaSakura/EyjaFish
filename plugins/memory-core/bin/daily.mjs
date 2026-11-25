// Daily consolidation entrypoint. Keep store import dynamic so --env-recheck
// still works when better-sqlite3 or the DB is broken.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const args = process.argv.slice(2)
const has = (flag) => args.includes(flag)
const arg = (name, fallback = '') => {
  const i = args.indexOf(name)
  return i >= 0 ? String(args[i + 1] ?? fallback) : fallback
}
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const runKey = arg('--run-key', today())
const dryRun = has('--dry-run')
const maxWindows = Math.max(0, Number(arg('--max-windows', '20')) || 20)
const dataDir = 'D:\\DSH\\qqbot\\data\\memory'
const dbFile = arg('--db', join(dataDir, 'memory.db'))
const backupDir = arg('--backup-dir', join(dataDir, 'backups'))
const reportFile = join(dataDir, `daily-report-${runKey}.json`)

function readKey() {
  if (process.env.DEEPSEEK_API_KEY) return String(process.env.DEEPSEEK_API_KEY).trim()
  const file = join(dataDir, 'deepseek-key.txt')
  try { return existsSync(file) ? readFileSync(file, 'utf8').trim() : '' } catch { return '' }
}

function emit(payload) {
  console.log(JSON.stringify(payload, null, 2))
}

if (has('--env-recheck')) {
  try {
    const mod = await import('../index.mjs')
    const requireFn = createRequire(import.meta.url)
    const probe = mod.envprobe({ checkSqlite: true, requireFn })
    emit({ ok: Boolean(probe.ok), probe })
    process.exitCode = probe.ok ? 0 : 1
  } catch (error) {
    emit({ ok: false, reason: String(error?.message ?? error) })
    process.exitCode = 1
  }
} else {
  let db = null
  let runLog = null
  try {
    const { openStore, closeStore } = await import('../store.mjs')
    const { runDaily } = await import('../consolidate.mjs')
    db = openStore(dbFile)
    const existing = db.prepare('SELECT run_key,status,started_at FROM consolidation_log WHERE run_key=?').get(runKey)
    if (existing && !dryRun) {
      if (existing.status === 'done') {
        emit({ ok: true, skipped: true, reason: 'already-done', runKey })
        closeStore(db)
        process.exitCode = 0
      } else if (existing.status === 'running' && Date.now() - Number(existing.started_at) < 2 * 60 * 60 * 1000) {
        emit({ ok: true, skipped: true, reason: 'already-running', runKey })
        closeStore(db)
        process.exitCode = 0
      } else {
        db.prepare("UPDATE consolidation_log SET status='running', started_at=?, error=NULL WHERE run_key=?")
          .run(Date.now(), runKey)
      }
    }
    if (!existing) {
      runLog = db.prepare(`INSERT INTO consolidation_log(run_key,kind,status,started_at)
        VALUES (?,?,?,?)`).run(runKey, 'daily', 'running', Date.now())
    }
    if (!dryRun) mkdirSync(backupDir, { recursive: true })
    const backupFile = join(backupDir, `memory-${runKey}.db`)
    const result = await runDaily(db, {
      now: Date.now(),
      apiKey: readKey(),
      maxWindows,
      allowLLM: !has('--no-llm'),
      backupFile,
      dryRun,
    })
    const report = { ok: true, runKey, at: new Date().toISOString(), dbFile, ...result }
    writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8')
    if (!dryRun) db.prepare("UPDATE consolidation_log SET status='done', payload_json=?, expires_at=? WHERE run_key=?").run(JSON.stringify(result), Date.now(), runKey)
    emit(report)
    closeStore(db)
    process.exitCode = 0
  } catch (error) {
    try {
      if (db && !dryRun) db.prepare("UPDATE consolidation_log SET status='failed', error=? WHERE run_key=?").run(String(error?.message ?? error), runKey)
    } catch { /* ignore */ }
    try { if (db) db.close() } catch { /* ignore */ }
    emit({ ok: false, runKey, reason: String(error?.message ?? error), exit: 2 })
    process.exitCode = 2
  }
}
