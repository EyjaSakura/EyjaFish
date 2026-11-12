// Minimal stage-1 recall surface for shadow comparison. The richer ranking and
// budget assembly arrive in stage 2; this returns a short, deterministic block.
import { searchCandidates } from './store.mjs'

export function recallText(db, { subject, query = '', limit = 8 } = {}) {
  if (!db || !subject) return ''
  const rows = searchCandidates(db, query, { subject, limit })
  if (rows.length === 0) return ''
  const lines = rows.slice(0, limit).map((row) => `- ${String(row.description ?? '').slice(0, 120)}`)
  return ['【记忆候选 · stage1 shadow】', ...lines].join('\n')
}
