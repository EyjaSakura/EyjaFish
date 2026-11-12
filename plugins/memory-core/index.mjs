// memory-core stage 0 — pure library, no DSH / bridge / QQ dependencies.
// Stage 0 only exposes the environment probe and version marker. SQLite,
// extraction and recall move in during stage 1 behind this same module.
export const VERSION = '0.1.0-stage0'
export const STAGE = 0

export function envprobe({ checkSqlite = false, requireFn = null } = {}) {
  const result = {
    ok: true,
    stage: STAGE,
    version: VERSION,
    driver: 'legacy-adapter',
    sqlite: 'not-checked',
    fts5: 'not-checked',
    icu: 'not-checked',
    reason: '',
  }
  try {
    // Intl.Segmenter is part of full-icu; stage 0 uses it only to report.
    new Intl.Segmenter('zh', { granularity: 'word' })
    result.icu = 'ok'
  } catch (error) {
    result.icu = 'missing'
    result.ok = false
    result.reason = `Intl.Segmenter unavailable: ${error?.message ?? error}`
    return result
  }
  if (!checkSqlite) return result
  try {
    const req = requireFn ?? (() => { throw new Error('requireFn not provided') })
    const Database = req('better-sqlite3')
    const db = new Database(':memory:')
    try {
      db.exec('CREATE VIRTUAL TABLE t USING fts5(x)')
      result.driver = 'better-sqlite3'
      result.sqlite = 'ok'
      result.fts5 = 'ok'
    } finally {
      db.close()
    }
  } catch (error) {
    result.ok = false
    result.sqlite = 'failed'
    result.fts5 = 'failed'
    result.reason = `better-sqlite3/FTS5 unavailable: ${error?.message ?? error}`
  }
  return result
}
