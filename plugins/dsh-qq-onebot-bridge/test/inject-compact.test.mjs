import test from 'node:test'
import assert from 'node:assert/strict'
import { compactInjectQueue } from '../lib/services/inject-compact.js'

function harness(overrides = {}) {
  const calls = []
  return {
    calls,
    deps: {
      injectFile: 'inject.jsonl',
      injectTailer: { position: 0, reset: (hard) => calls.push(['reset', hard]) },
      trace: { event: (e) => calls.push(['trace', e]) },
      onConsumed: () => calls.push('consumed'),
      debugLog: (m) => calls.push(['log', m]),
      stat: () => ({ size: 0 }),
      rename: (a, b) => calls.push(['rename', a, b]),
      writeFile: (f, d) => calls.push(['write', f, d]),
      rm: (f, opts) => calls.push(['rm', f, opts.force]),
      ...overrides,
    },
  }
}

test('不足 256KB 不处理', () => {
  const h = harness()
  compactInjectQueue(h.deps)
  assert.equal(h.calls.length, 0)
})

test('还有未读内容不压缩', () => {
  const h = harness({ stat: () => ({ size: 300 * 1024 }) })
  h.deps.injectTailer.position = 1
  compactInjectQueue(h.deps)
  assert.equal(h.calls.length, 0)
})

test('全部消费后改名、清空、reset、删临时文件、trace', () => {
  const h = harness({ stat: () => ({ size: 300 * 1024 }) })
  h.deps.injectTailer.position = 300 * 1024
  compactInjectQueue(h.deps)
  assert.deepEqual(h.calls[0], ['rename', 'inject.jsonl', 'inject.jsonl.compacted'])
  assert.deepEqual(h.calls[1], ['write', 'inject.jsonl', ''])
  assert.deepEqual(h.calls[2], ['reset', true])
  assert.equal(h.calls.includes('consumed'), true)
  assert.deepEqual(h.calls[4], ['rm', 'inject.jsonl.compacted', true])
  assert.equal(h.calls[5][1].stage, 'inject')
})

test('stat 抛错只记日志', () => {
  const h = harness({ stat: () => { throw new Error('io') } })
  compactInjectQueue(h.deps)
  assert.match(h.calls[0][1], /inject queue compact skipped/)
})
