// Shadow observation report. Reads memory.db + status.json + bridge debug log.
// Usage:
//   node bin/shadow-report.mjs [--days 2] [--out path.md]
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { openStore, closeStore, count, DEFAULT_DB } from '../index.mjs'

const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const days = Math.max(1, Number(arg('--days', 2)) || 2)
const dbFile = arg('--db', DEFAULT_DB)
const statusFile = arg('--status', 'D:\\DSH\\qqbot\\data\\memory\\status.json')
const logFile = arg('--log', 'C:\\Users\\Eyjafjalla\\qq-bridge-debug.log')
const shadowLogFile = arg('--shadow-log', 'D:\\DSH\\qqbot\\data\\memory\\shadow-recall.jsonl')
const outFile = arg('--out', join('D:\\DSH\\qqbot\\data\\memory', `shadow-report-${new Date().toISOString().slice(0, 10)}.md`))
const since = Date.now() - days * 86_400_000

function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return null }
}
function q(db, sql, ...params) {
  try { return db.prepare(sql).all(...params) } catch { return [] }
}
function one(db, sql, ...params) {
  try { return db.prepare(sql).get(...params) } catch { return null }
}

const status = readJson(statusFile) ?? { mode: 'unknown' }
const db = existsSync(dbFile) ? openStore(dbFile) : null
const lines = []
lines.push(`# 记忆 shadow 报告（${new Date().toLocaleString('zh-CN')}）`)
lines.push('')
lines.push('## 模式')
lines.push('```json')
lines.push(JSON.stringify({ mode: status.mode, reason: status.reason ?? '', degradedAt: status.degradedAt ?? null, recoveredAt: status.recoveredAt ?? null }, null, 2))
lines.push('```')
if (!db) {
  lines.push('')
  lines.push(`数据库不存在：${dbFile}`)
} else {
  const nodeTotal = count(db, 'nodes')
  const byType = q(db, 'SELECT type, COUNT(*) AS n FROM nodes GROUP BY type ORDER BY n DESC')
  const byStatus = q(db, 'SELECT status, COUNT(*) AS n FROM nodes GROUP BY status ORDER BY n DESC')
  const newNodes = one(db, 'SELECT COUNT(*) AS n FROM nodes WHERE created_at>=?', since)?.n ?? 0
  const turns = count(db, 'window_turns')
  const newTurns = one(db, 'SELECT COUNT(*) AS n FROM window_turns WHERE ts>=?', since)?.n ?? 0
  const queue = q(db, 'SELECT status, COUNT(*) AS n FROM ingest_queue GROUP BY status')
  const dead = count(db, 'ingest_dead_letter')
  const pending = one(db, "SELECT COUNT(*) AS n FROM nodes WHERE status='pending'")?.n ?? 0
  const decisions = q(db, 'SELECT decision, COUNT(*) AS n FROM turn_decisions GROUP BY decision')
  const topSubjects = q(db, 'SELECT subject, COUNT(*) AS n FROM nodes GROUP BY subject ORDER BY n DESC LIMIT 8')
  const accessed = one(db, 'SELECT COUNT(*) AS n FROM nodes WHERE last_accessed_at>=?', since)?.n ?? 0
  lines.push('')
  lines.push('## 数据')
  lines.push('```json')
  lines.push(JSON.stringify({ nodeTotal, newNodes, turns, newTurns, pending, accessed, dead, byType, byStatus, queue, decisions, topSubjects }, null, 2))
  lines.push('```')
  closeStore(db)
}

let recallLines = []
if (existsSync(logFile)) {
  try {
    const tail = readFileSync(logFile, 'utf8').split('\n').slice(-5000)
    recallLines = tail.filter((line) => line.includes('[memory] recall'))
  } catch { /* ignore */ }
}
const recallBy = {}
for (const line of recallLines) {
  const mode = /mode=([^\s]+)/.exec(line)?.[1] ?? '?'
  const source = /source=([^\s]+)/.exec(line)?.[1] ?? '?'
  const key = `${mode}/${source}`
  recallBy[key] = (recallBy[key] ?? 0) + 1
}
lines.push('')
lines.push('## Recall 日志（最近 5000 行）')
lines.push('```json')
lines.push(JSON.stringify({ total: recallLines.length, by: recallBy }, null, 2))
lines.push('```')
let shadowRows = []
if (existsSync(shadowLogFile)) {
  try {
    shadowRows = readFileSync(shadowLogFile, 'utf8').split('\n').filter(Boolean).slice(-5000)
      .map((line) => { try { return JSON.parse(line) } catch { return null } })
      .filter((row) => row && Number(row.ts) >= since)
  } catch { /* ignore */ }
}
const shadowNonEmpty = shadowRows.filter((row) => String(row.text ?? '') !== '').length
const shadowBySource = {}
for (const row of shadowRows) shadowBySource[row.source || '?'] = (shadowBySource[row.source || '?'] ?? 0) + 1
lines.push('')
lines.push('## Shadow 候选记录')
lines.push('```json')
lines.push(JSON.stringify({
  total: shadowRows.length,
  nonEmpty: shadowNonEmpty,
  empty: shadowRows.length - shadowNonEmpty,
  bySource: shadowBySource,
  samples: shadowRows.filter((row) => String(row.text ?? '') !== '').slice(-5).map((row) => ({
    at: new Date(Number(row.ts)).toLocaleString('zh-CN'),
    query: row.query,
    text: String(row.text).slice(0, 240),
  })),
}, null, 2))
lines.push('```')
lines.push('')
lines.push('## 观察建议')
lines.push('- 关注 source=stage2-shadow 且候选非空的比例')
lines.push('- 关注 pending 是否增长过快')
lines.push('- 关注 dead_letter / queue failed 是否非 0')
lines.push('- 关注新节点是否明显多于真实实质性消息')

const markdown = lines.join('\n') + '\n'
writeFileSync(outFile, markdown, 'utf8')
process.stdout.write(markdown)
process.stdout.write(`\n报告已写入：${outFile}\n`)
