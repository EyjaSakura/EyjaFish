import test from 'node:test'
import assert from 'node:assert/strict'
import { preclaimSessions } from '../lib/services/preclaim-sessions.js'

function harness(overrides = {}) {
  const calls = []
  return {
    calls,
    deps: {
      config: {},
      bindingTargets: () => [['u:1', 's1']],
      syntheticMessageForKey: () => ({ id: 1 }),
      roleOf: () => ({ guest: false }),
      resumeSession: async (m, k, id) => { calls.push(['resume', k, id]); return { sessionId: 's1' } },
      bindSession: (k, id, source) => calls.push(['bind', k, id, source]),
      logger: { info: (m) => calls.push(['info', m]) },
      trace: { event: (e) => calls.push(['trace', e]) },
      isWriterHeld: () => false,
      debugLog: (m) => calls.push(['log', m]),
      ...overrides,
    },
  }
}

test('开关关闭不执行', async () => {
  for (const config of [{ preclaimSessions: false }, { sessionResumeEnabled: false }]) {
    const h = harness({ config })
    await preclaimSessions(h.deps)
    assert.equal(h.calls.length, 0)
  }
})

test('guest 跳过', async () => {
  const h = harness({ roleOf: () => ({ guest: true }) })
  await preclaimSessions(h.deps)
  assert.equal(h.calls.length, 0)
})

test('成功续接 + 绑定 + trace', async () => {
  const h = harness()
  await preclaimSessions(h.deps)
  assert.deepEqual(h.calls[0], ['resume', 'u:1', 's1'])
  assert.deepEqual(h.calls[1], ['bind', 'u:1', 's1', 'preclaim'])
  assert.equal(h.calls.some((c) => c[0] === 'trace' && c[1].ok === true), true)
})

test('失败：warn trace + writerHeld', async () => {
  const h = harness({
    resumeSession: async () => { throw new Error('locked') },
    isWriterHeld: () => true,
  })
  await preclaimSessions(h.deps)
  const trace = h.calls.find((c) => c[0] === 'trace')[1]
  assert.equal(trace.ok, false)
  assert.equal(trace.data.writerHeld, true)
  assert.match(trace.reason, /启动占位跳过/)
})
