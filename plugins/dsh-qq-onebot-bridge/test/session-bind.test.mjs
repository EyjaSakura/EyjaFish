import test from 'node:test'
import assert from 'node:assert/strict'
import { bindSession } from '../lib/services/session-bind.js'

function harness(overrides = {}) {
  const calls = []
  const events = []
  let pending = overrides.pending === true
  const deps = {
    key: 'u:1',
    sessionId: 'session-abcdef',
    source: 'open',
    getBinding: () => overrides.binding ?? null,
    setBinding: (k, b) => calls.push(['setBinding', k, b.sessionId]),
    rememberSession: (k, id) => calls.push(['remember', k, id]),
    ensureMembership: async (b, id, k, src) => calls.push(['membership', id, src]),
    backfill: async () => calls.push(['backfill']),
    isBackfillPending: () => pending,
    clearBackfillPending: () => { pending = false; calls.push(['clearPending']) },
    trace: { event: (e) => events.push(e) },
    ...overrides,
  }
  return { deps, calls, events }
}

test('无工作区绑定：记聊天会话', () => {
  const { deps, calls } = harness()
  bindSession(deps)
  assert.deepEqual(calls, [['remember', 'u:1', 'session-abcdef']])
})

test('工作区绑定：更新 + 登记成员', async () => {
  const { deps, calls } = harness({ binding: { title: 'A', path: 'D:/a', sessionId: 'old' } })
  bindSession(deps)
  await new Promise((r) => setImmediate(r))
  assert.equal(calls.some((c) => c[0] === 'setBinding'), true)
  assert.equal(calls.some((c) => c[0] === 'membership'), true)
})

test('登记成员同步抛错被吞掉', () => {
  const { deps } = harness({
    binding: { title: 'A', path: 'D:/a' },
    ensureMembership: () => { throw new Error('boom') },
  })
  assert.doesNotThrow(() => bindSession(deps))
})

test('回填挂起时补跑并清标记', async () => {
  const { deps, calls } = harness({ pending: true })
  bindSession(deps)
  await new Promise((r) => setImmediate(r))
  assert.equal(calls.some((c) => c[0] === 'clearPending'), true)
  assert.equal(calls.some((c) => c[0] === 'backfill'), true)
})

test('trace 记录 scope', () => {
  const ws = harness({ binding: { title: 'A', path: 'D:/a' } })
  bindSession(ws.deps)
  assert.equal(ws.events.at(-1).data.scope, 'workspace')

  const chat = harness()
  bindSession(chat.deps)
  assert.equal(chat.events.at(-1).data.scope, 'chat')
})
