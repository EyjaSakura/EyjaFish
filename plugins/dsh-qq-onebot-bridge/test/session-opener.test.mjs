import test from 'node:test'
import assert from 'node:assert/strict'
import { openSession } from '../lib/core/session-opener.js'

function makeHost(overrides = {}) {
  const calls = []
  return {
    calls,
    host: {
      config: { sessionResumeEnabled: true },
      logger: { info: (m) => calls.push(['info', m]), warn: (m) => calls.push(['warn', m]) },
      debugLog: () => {},
      workspaceBinding: () => null,
      openWorkspaceSession: async (m, k, b) => { calls.push(['workspace', b.path]); return { sessionId: 'ws1' } },
      storedSessionId: () => 'stored1',
      resumeSession: async (m, k, s) => { calls.push(['resume', s]); return { sessionId: 'resumed1' } },
      resolveOwnershipConflict: async () => undefined,
      createSession: async () => { calls.push(['create']); return { sessionId: 'new1' } },
      forgetSession: (k) => calls.push(['forget', k]),
      ...overrides,
    },
  }
}

const msg = { userId: 1 }

test('有工作区绑定：走 openWorkspaceSession', async () => {
  const { host, calls } = makeHost({ workspaceBinding: () => ({ path: 'D:/ws' }) })
  const entry = await openSession({ message: msg, key: 'u:1', host })
  assert.equal(entry.sessionId, 'ws1')
  assert.deepEqual(calls[0], ['workspace', 'D:/ws'])
})

test('工作区冲突：向上抛', async () => {
  const err = Object.assign(new Error('conflict'), { dshSessionConflict: true })
  const { host } = makeHost({
    workspaceBinding: () => ({ path: 'D:/ws' }),
    openWorkspaceSession: async () => { throw err },
  })
  await assert.rejects(() => openSession({ message: msg, key: 'u:1', host }), (e) => e.dshSessionConflict === true)
})

test('工作区普通失败：回退到持久会话', async () => {
  const { host, calls } = makeHost({
    workspaceBinding: () => ({ path: 'D:/ws' }),
    openWorkspaceSession: async () => { throw new Error('boom') },
  })
  const entry = await openSession({ message: msg, key: 'u:1', host })
  assert.equal(entry.sessionId, 'resumed1')
  assert.ok(calls.some(([t]) => t === 'warn'))
})

test('持久会话续接成功', async () => {
  const { host, calls } = makeHost()
  const entry = await openSession({ message: msg, key: 'u:1', host })
  assert.equal(entry.sessionId, 'resumed1')
  assert.ok(calls.some(([t, m]) => t === 'info' && String(m).includes('resumed session')))
})

test('续接失败但冲突已解决', async () => {
  const { host } = makeHost({
    resumeSession: async () => { throw new Error('owned') },
    resolveOwnershipConflict: async () => ({ sessionId: 'reclaimed' }),
  })
  const entry = await openSession({ message: msg, key: 'u:1', host })
  assert.equal(entry.sessionId, 'reclaimed')
})

test('续接失败且无解：forget + 新建', async () => {
  const { host, calls } = makeHost({ resumeSession: async () => { throw new Error('bad') } })
  const entry = await openSession({ message: msg, key: 'u:1', host })
  assert.equal(entry.sessionId, 'new1')
  assert.ok(calls.some(([t]) => t === 'forget'))
  assert.ok(calls.some(([t]) => t === 'create'))
})

test('关闭续接：直接新建', async () => {
  const { host, calls } = makeHost({ config: { sessionResumeEnabled: false } })
  const entry = await openSession({ message: msg, key: 'u:1', host })
  assert.equal(entry.sessionId, 'new1')
  assert.equal(calls.some(([t]) => t === 'resume'), false)
})
