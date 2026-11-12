// Stage 2 recall surface: rank candidates and format a compact block.
import { rankCandidates, touchCandidates } from './rank.mjs'

/**
 * @param {any} db
 * @param {{ subject?: string, query?: string, limit?: number, now?: number }} [options]
 */
export function recallText(db, { subject, query = '', limit = 8, now = Date.now() } = {}) {
  if (!db || !subject) return ''
  const rows = rankCandidates(db, { subject, query, limit, now })
  if (rows.length === 0) return ''
  touchCandidates(db, rows, now)
  const lines = rows.map((row) => `- ${String(row.description ?? '').slice(0, 120)}`)
  return ['【记忆候选 · stage2 shadow】', ...lines].join('\n')
}
