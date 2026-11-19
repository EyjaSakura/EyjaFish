// Local knowledge picker. Pure file-backed; no network, no memory coupling.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const DEFAULT_KNOWLEDGE_ROOT = 'D:\\DSH\\qqbot\\knowledge'
export const DEFAULT_USAGE_FILE = 'D:\\DSH\\qqbot\\data\\knowledge-usage.json'

export function loadKnowledge(category = 'history', root = DEFAULT_KNOWLEDGE_ROOT) {
  const file = join(root, `${category}.jsonl`)
  if (!existsSync(file)) return []
  const rows = []
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line.trim() === '') continue
    try {
      const row = JSON.parse(line)
      if (row && row.id && row.text && row.category === category && row.enabled !== false) rows.push(row)
    } catch { /* skip bad line */ }
  }
  return rows
}

export function readUsage(file = DEFAULT_USAGE_FILE) {
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return {} }
}

export function writeUsage(usage, file = DEFAULT_USAGE_FILE) {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, JSON.stringify(usage, null, 2), 'utf8')
  renameSync(tmp, file)
}

export function pickKnowledge({
  category = 'history',
  categories = null,
  root = DEFAULT_KNOWLEDGE_ROOT,
  usageFile = DEFAULT_USAGE_FILE,
  random = Math.random,
  now = Date.now(),
  record = true,
} = {}) {
  const wanted = Array.isArray(categories) && categories.length > 0 ? categories : [category]
  const rows = wanted.flatMap((name) => loadKnowledge(name, root))
  if (rows.length === 0) return null
  const usage = readUsage(usageFile)
  const scored = rows.map((row) => {
    const last = Number(usage[row.id]?.lastUsedAt ?? 0)
    const weight = Math.max(0.1, Number(row.weight ?? 1))
    return { row, last, weight, tie: random() / weight }
  })
  scored.sort((a, b) => (a.last - b.last) || (a.tie - b.tie))
  const picked = scored[0].row
  if (record) {
    usage[picked.id] = {
      lastUsedAt: now,
      count: Number(usage[picked.id]?.count ?? 0) + 1,
    }
    writeUsage(usage, usageFile)
  }
  return { ...picked, lastUsedAt: Number(usage[picked.id]?.lastUsedAt ?? now), usedCount: Number(usage[picked.id]?.count ?? 0) }
}
