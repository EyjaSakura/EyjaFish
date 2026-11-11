import test from 'node:test'
import assert from 'node:assert/strict'
import { openWorkspaceSession } from '../lib/services/workspace-open.js'

function harness(overrides = {}) {
  const calls = []
  const deps = {
    message: {},
    key: 'u:1',
    binding: { path: 'D:/ws', sessionId: 's1' },
    roleOf: () => ({ guest: false }),
    clearBinding: (k) => calls.push(['clear', k]),
    sessionRoot: 'D:/sessions',
    sessionsOf: () => [{ id: 's1' }, { id: 's2' }],
    exists: () => false,
    resumeSession: async (m, k, id) => { calls.push(['resume', id]); return { sessionId: id } },
    bindSession: (k, id) => calls.push(['bind', id]),
    resolveOwnershipConflict: async () => undefined,
    createSession: async (m, k, opts) => { calls.push(['create', opts.cwd]); return { sessionId: 'new' } },
    logger: { info: () => {} },
    debugLog: () => {},
    ...overrides,
  }
  return { deps, calls }
}

test('guest 清绑定并抛错', async () => {
  const h = harness({ roleOf: () => ({ guest: true }) })
  await assert.rejects(() => openWorkspaceSession(h.deps), /guest/)
  assert.deepEqual(h.calls[0], ['clear', 'u:1'])
})

test('binding 会话有效：恢复并绑定', async () => {
  const h = harness()
  const entry = await openWorkspaceSession(h.deps)
  assert.equal(entry.sessionId, 's1')
  assert.deepEqual(h.calls, [['resume', 's1'], ['bind', 's1']])
})

test('binding 无效：取最近会话', async () => {
  const h = harness({ binding: { path: 'D:/ws', sessionId: 'gone' } })
  await openWorkspaceSession(h.deps)
  assert.deepEqual(h.calls, [['resume', 's1'], ['bind', 's1']])
})

test('恢复失败且无冲突：新建并绑定', async () => {
  const h = harness({ resumeSession: async () => { throw new Error('no') } })
  const entry = await openWorkspaceSession(h.deps)
  assert.equal(entry.sessionId, 'new')
  assert.deepEqual(h.calls, [['create', 'D:/ws'], ['bind', 'new']])
})

test('恢复失败但有冲突处理结果：直接返回', async () => {
  const h = harness({
    resumeSession: async () => { throw new Error('conflict') },
    resolveOwnershipConflict: async () => ({ sessionId: 'resolved' }),
  })
  const entry = await openWorkspaceSession(h.deps)
  assert.equal(entry.sessionId, 'resolved')
  assert.equal(h.calls.length, 0)
})
