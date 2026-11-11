import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveOwnershipConflict } from '../lib/services/session-ownership.js'

function harness(overrides = {}) {
  const events = []
  const binds = []
  return {
    events,
    binds,
    deps: {
      message: {},
      key: 'u:1',
      sessionId: 'session-abcdef',
      error: { name: 'SessionAlreadyOwnedError' },
      isWriterHeld: (e) => e?.name === 'SessionAlreadyOwnedError',
      config: { sessionClaimRetries: 2, sessionClaimRetryMs: 50 },
      resumeSession: async () => ({ sessionId: 'session-new' }),
      bindSession: (k, id, src) => binds.push([k, id, src]),
      trace: { event: (e) => events.push(e) },
      logger: { info: () => {} },
      debugLog: () => {},
      sleep: async () => {},
      ...overrides,
    },
  }
}

test('非写权错误返回 undefined', async () => {
  const h = harness({ error: new Error('other') })
  assert.equal(await resolveOwnershipConflict(h.deps), undefined)
})

test('重试成功：bind reclaim + trace', async () => {
  let calls = 0
  const h = harness({
    resumeSession: async () => {
      calls += 1
      if (calls === 1) throw { name: 'SessionAlreadyOwnedError' }
      return { sessionId: 'session-new' }
    },
  })
  const entry = await resolveOwnershipConflict(h.deps)
  assert.equal(entry.sessionId, 'session-new')
  assert.deepEqual(h.binds, [['u:1', 'session-new', 'reclaim']])
  assert.equal(h.events.at(-1).ok, true)
})

test('重试遇到非写权错误向上抛', async () => {
  const h = harness({ resumeSession: async () => { throw new Error('boom') } })
  await assert.rejects(() => resolveOwnershipConflict(h.deps), /boom/)
})

test('一直写权冲突：拒绝 fork 并保留绑定', async () => {
  const h = harness({ resumeSession: async () => { throw { name: 'SessionAlreadyOwnedError' } } })
  await assert.rejects(() => resolveOwnershipConflict(h.deps), (err) => {
    assert.equal(err.dshSessionConflict, true)
    assert.match(err.message, /另一个客户端/)
    return true
  })
  assert.equal(h.events.at(-1).data.outcome, 'refused-fork')
  assert.equal(h.events.at(-1).data.bindingKept, true)
})
