// memory-core stage 1 — pure library, no DSH / bridge / QQ dependencies.
// SQLite store, migration, ingest and the minimal recall surface live here.
export const VERSION = '0.3.0-stage2'
export const STAGE = 2
export { DEFAULT_DB, openStore, closeStore, addNode, addWindowTurn, setDecision, enqueue, searchCandidates, listPending, confirmNode, count, SCHEMA_VERSION } from './store.mjs'
export { buildTokens, buildWordTokens, buildCharTokens, hasIcu } from './tokenize.mjs'
export { extractEntities, extractStageOneNodes, isSubstantive, isInternalText, isMemoryEvent } from './extract.mjs'
export { ingestTurn } from './ingest.mjs'
export { recallText } from './recall.mjs'
export { rankCandidates, touchCandidates } from './rank.mjs'
export { migrateLegacy } from './migrate.mjs'
export { buildExtractionPrompt, parseExtraction, validateExtraction, extractWithLLM } from './llm-extract.mjs'

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
