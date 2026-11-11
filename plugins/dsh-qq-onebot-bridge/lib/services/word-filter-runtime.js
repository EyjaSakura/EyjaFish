// Bad-word filter with mtime-based hot reload.
import { statSync, readFileSync } from 'node:fs'
import { WordFilter, parseWordList } from '../filter.js'
import { debugLog } from '../core/debug-log.js'

export function loadWordFilter({ file, whitelist, cache }) {
  let stamp = 'missing'
  try {
    const stat = statSync(file)
    stamp = `${stat.mtimeMs}:${stat.size}`
  } catch { /* missing -> empty filter */ }
  if (cache.stamp === stamp) return cache.filter
  let filter = new WordFilter({ whitelist })
  try {
    const parsed = parseWordList(readFileSync(file, 'utf8'))
    filter = new WordFilter({
      words: [...parsed.words, ...parsed.patterns.map((re) => `re:${re.source}`)],
      whitelist,
    })
    if (parsed.invalid.length > 0) debugLog(`badword list has ${parsed.invalid.length} invalid entries`)
  } catch { /* unreadable -> empty */ }
  cache.stamp = stamp
  cache.filter = filter
  debugLog(`badword list loaded (${filter.size} entries)`)
  return filter
}
