import test from 'node:test'
import assert from 'node:assert/strict'
import { createSessionEntry } from '../lib/core/session-entry.js'

test('标准字段与默认值', () => {
  const e = createSessionEntry({ key: 'u:1', route: { targetId: 1 }, handle: { agent: { id: 42 } } })
  assert.equal(e.key, 'u:1')
  assert.equal(e.sessionId, '42')
  assert.equal(e.resumed, false)
  assert.equal(e.turnActive, false)
  assert.equal(e.currentTurnInjected, false)
  assert.deepEqual(e.pendingTurns, [])
})

test('resumed 与 route/handle 引用', () => {
  const route = { targetId: 2 }
  const handle = { agent: { id: 'abc' } }
  const e = createSessionEntry({ key: 'g:9', route, handle, resumed: true })
  assert.equal(e.resumed, true)
  assert.equal(e.route, route)
  assert.equal(e.handle, handle)
  assert.equal(e.agent, handle.agent)
})

test('每个条目有独立 pendingTurns', () => {
  const a = createSessionEntry({ key: 'a', route: {}, handle: { agent: { id: 1 } } })
  const b = createSessionEntry({ key: 'b', route: {}, handle: { agent: { id: 2 } } })
  a.pendingTurns.push({ injected: true })
  assert.equal(b.pendingTurns.length, 0)
})
