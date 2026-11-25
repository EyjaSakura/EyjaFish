// Stage 2 recall surface: rank candidates and format a compact block.
import { rankCandidates, touchCandidates } from './rank.mjs'

/**
 * @param {any} db
 * @param {{ subject?: string, query?: string, limit?: number, now?: number, budgetChars?: number, mode?: string }} [options]
 */
export function recallText(db, { subject, query = '', limit = 8, now = Date.now(), budgetChars = 900, mode = 'shadow' } = {}) {
  if (!db || !subject) return ''
  const rows = rankCandidates(db, { subject, query, limit, now })
  if (rows.length === 0) return ''
  touchCandidates(db, rows, now)
  const header = mode === 'on' ? '【记忆】' : '【记忆候选 · stage2 shadow】'
  const budget = Math.max(80, Number(budgetChars) || 900)
  const lines = []
  let used = header.length
  for (const row of rows) {
    const line = `- ${String(row.description ?? '').slice(0, 120)}`
    if (used + line.length + 1 > budget) break
    lines.push(line)
    used += line.length + 1
  }
  if (lines.length === 0) return ''
  return [header, ...lines].join('\n')
}
