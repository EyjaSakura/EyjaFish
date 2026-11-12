// Local shadow-recall journal. Used only for the observation window.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import { dirname } from 'node:path'

export const DEFAULT_SHADOW_LOG = 'D:\\DSH\\qqbot\\data\\memory\\shadow-recall.jsonl'
const MAX_BYTES = 5 * 1024 * 1024

export function appendShadowRecall(entry, file = DEFAULT_SHADOW_LOG) {
  try {
    mkdirSync(dirname(file), { recursive: true })
    if (existsSync(file) && statSync(file).size > MAX_BYTES) renameSync(file, `${file}.1`)
    appendFileSync(file, JSON.stringify({
      ts: Date.now(),
      mode: String(entry.mode ?? ''),
      source: String(entry.source ?? ''),
      subject: String(entry.subject ?? ''),
      query: String(entry.query ?? '').slice(0, 500),
      text: String(entry.text ?? '').slice(0, 2000),
      chars: String(entry.text ?? '').length,
    }) + '\n', 'utf8')
  } catch { /* observation must never break chat */ }
}

export function readShadowRecall(file = DEFAULT_SHADOW_LOG, { since = 0, limit = 5000 } = {}) {
  if (!existsSync(file)) return []
  const rows = []
  try {
    const lines = readFileSync(file, 'utf8').split('\n')
    for (const line of lines.slice(-limit)) {
      if (line.trim() === '') continue
      try {
        const row = JSON.parse(line)
        if (Number(row.ts) >= since) rows.push(row)
      } catch { /* skip bad line */ }
    }
  } catch { /* ignore */ }
  return rows
}
