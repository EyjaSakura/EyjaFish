import test from 'node:test'
import assert from 'node:assert/strict'
import { onTransferRequested } from '../lib/services/session-transfer.js'

function harness(overrides = {}) {
  const calls = []
  const deps = {
    config: { claimSessionTransfer: true },
    payload: { fromSessionId: 'old-123456789', digest: '摘要', cwd: '' },
    findChatForSession: () => ({ key: 'u:1', message: { id: 1 } }),
    roleOf: () => ({ guest: false }),
    emit: (event) => calls.push(['emit', event]),
    workspaceBinding: () => ({ path: 'D:/ws' }),
    createSession: async () => { calls.push('create'); return { sessionId: 'new-123456789' } },
    handoff: () => calls.push('handoff'),
    replyTo: async (route, text) => calls.push(['reply', text]),
    routeOf: () => 'route',
    logger: { info: () => {} },
    trace: { event: (e) => calls.push(['trace', e]) },
    debugLog: () => {},
    ...overrides,
  }
  return { deps, calls }
}

test('关闭 / 非法 payload / 无目标直接返回', async () => {
  let calls = harness({ config: { claimSessionTransfer: false } })
  await onTransferRequested(calls.deps)
  assert.equal(calls.calls.length, 0)

  calls = harness({ payload: null })
  await onTransferRequested(calls.deps)
  assert.equal(calls.calls.length, 0)

  calls = harness({ findChatForSession: () => undefined })
  await onTransferRequested(calls.deps)
  assert.equal(calls.calls.length, 0)
})

test('guest 会话拒绝认领', async () => {
  const { deps, calls } = harness({ roleOf: () => ({ guest: true }) })
  await onTransferRequested(deps)
  assert.equal(calls.length, 0)
})

test('claim 广播失败只写 trace', async () => {
  const { deps, calls } = harness({ emit: () => { throw new Error('bus') } })
  await onTransferRequested(deps)
  assert.equal(calls.some((c) => Array.isArray(c) && c[0] === 'trace'), true)
  assert.equal(calls.includes('create'), false)
})

test('成功：建会话、注入摘要、commit + 回复', async () => {
  const { deps, calls } = harness()
  await onTransferRequested(deps)
  assert.equal(calls.includes('create'), true)
  assert.equal(calls.includes('handoff'), true)
  assert.equal(calls.some((c) => c[0] === 'emit' && c[1] === 'context-handoff/committed'), true)
  assert.equal(calls.some((c) => c[0] === 'reply' && /已交接/.test(c[1])), true)
})

test('无摘要不 handoff', async () => {
  const { deps, calls } = harness({ payload: { fromSessionId: 'old' } })
  await onTransferRequested(deps)
  assert.equal(calls.includes('handoff'), false)
  assert.equal(calls.includes('create'), true)
})

test('建会话失败：trace 错误 + aborted', async () => {
  const { deps, calls } = harness({ createSession: async () => { throw new Error('boom') } })
  await onTransferRequested(deps)
  assert.equal(calls.some((c) => c[0] === 'emit' && c[1] === 'context-handoff/aborted'), true)
  assert.equal(calls.some((c) => c[0] === 'trace' && c[1].ok === false), true)
})
