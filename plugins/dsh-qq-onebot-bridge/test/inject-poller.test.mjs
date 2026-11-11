import test from 'node:test'
import assert from 'node:assert/strict'
import { pollInjections } from '../lib/services/inject-poller.js'

function harness(overrides = {}) {
  const calls = []
  return {
    calls,
    deps: {
      stopped: false,
      injecting: false,
      retryDeferred: async () => calls.push('retry'),
      injectTailer: { poll: () => ['{"kind":"message"}', '', 'bad'] },
      parseInjectionLine: (line) => { calls.push(['parse', line]); return { kind: 'message', frame: {} } },
      handleInjection: async (kind) => { calls.push(['handle', kind]) },
      compactQueue: () => calls.push('compact'),
      trace: { event: (e) => calls.push(['trace', e]) },
      config: { botQq: 1 },
      debugLog: () => {},
      onConsumed: () => calls.push('consumed'),
      ...overrides,
    },
  }
}

test('正常消费：重试 → 解析/处理 → 压缩', async () => {
  const { deps, calls } = harness()
  await pollInjections(deps)
  assert.equal(calls.filter((c) => c === 'retry').length, 1)
  assert.equal(calls.filter((c) => c === 'consumed').length, 2)
  assert.equal(calls.filter((c) => Array.isArray(c) && c[0] === 'handle').length, 2)
  assert.equal(calls.includes('compact'), true)
})

test('停止 / 注入中直接返回', async () => {
  const stopped = harness({ stopped: true })
  await pollInjections(stopped.deps)
  assert.equal(stopped.calls.length, 0)

  const busy = harness({ injecting: true })
  await pollInjections(busy.deps)
  assert.equal(busy.calls.length, 0)
})

test('retry 失败只记日志，继续消费', async () => {
  const logs = []
  const { deps } = harness({ retryDeferred: async () => { throw new Error('boom') }, debugLog: (m) => logs.push(m) })
  await pollInjections(deps)
  assert.equal(logs.some((m) => m.includes('deferred inject retry failed')), true)
})

test('tailer 失败返回且不压缩', async () => {
  const logs = []
  const { deps, calls } = harness({
    injectTailer: { poll: () => { throw new Error('io') } },
    debugLog: (m) => logs.push(m),
  })
  await pollInjections(deps)
  assert.equal(logs.some((m) => m.includes('inject poll failed')), true)
  assert.equal(calls.includes('compact'), false)
})

test('单行处理失败留 trace，不影响后续', async () => {
  const { deps, calls } = harness({
    handleInjection: async () => { throw new Error('bad') },
  })
  await pollInjections(deps)
  assert.equal(calls.filter((c) => Array.isArray(c) && c[0] === 'trace').length, 2)
  assert.equal(calls.includes('compact'), true)
})
