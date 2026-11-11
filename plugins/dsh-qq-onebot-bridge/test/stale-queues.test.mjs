import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { clearStaleQueues } from '../lib/services/stale-queues.js'

function harness(overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'stale-'))
  const written = []
  return {
    written,
    deps: {
      loadDeferred: () => ({ 'u:1': [1, 2], 'g:9': [] }),
      deferredFile: () => 'deferred.json',
      writeFile: (file, data) => written.push([file, data]),
      loadOutbox: () => [{ ts: 1000 }, { ts: 2_000_000 }],
      saveOutbox: () => written.push(['save-outbox']),
      setOutbox: (v) => written.push(['set-outbox', v.length]),
      inbox: join(dir, 'inbox.jsonl'),
      offsetFile: join(dir, 'offset.json'),
      exists: () => true,
      readFile: (file) => (file.endsWith('inbox.jsonl') ? 'x'.repeat(30 * 1024) : '{"offset":0}'),
      now: 2_000_000,
      debugLog: () => {},
      ...overrides,
    },
  }
}

test('清理 deferred / 过期 outbox / 抖音积压', () => {
  const h = harness()
  clearStaleQueues(h.deps)
  assert.equal(h.written.some(([f, d]) => f === 'deferred.json' && d === '{}'), true)
  assert.equal(h.written.some(([f]) => f === 'set-outbox'), true)
  assert.equal(h.written.some(([f]) => f === 'save-outbox'), true)
  assert.equal(h.written.some(([f]) => f.endsWith('offset.json')), true)
})

test('空 deferred / 无积压时不动', () => {
  const h = harness({
    loadDeferred: () => ({}),
    loadOutbox: () => [{ ts: 2_000_000 }],
    readFile: () => 'small',
  })
  clearStaleQueues(h.deps)
  assert.equal(h.written.length, 0)
})

test('每一步失败都不抛', () => {
  const h = harness({
    loadDeferred: () => { throw new Error('a') },
    loadOutbox: () => { throw new Error('b') },
    exists: () => { throw new Error('c') },
  })
  assert.doesNotThrow(() => clearStaleQueues(h.deps))
})
