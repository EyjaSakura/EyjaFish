import test from 'node:test'
import assert from 'node:assert/strict'
import { deliverExternal } from '../lib/services/deliver-external.js'

function harness(overrides = {}) {
  const events = []
  return {
    events,
    deps: {
      chatKey: 'g:9',
      text: 'hi',
      stage: '播报',
      routeFromChatKey: () => ({ messageType: 'group', targetId: 9 }),
      server: { currentSocket: () => ({}) },
      replyTo: async () => true,
      trace: { event: (e) => events.push(e) },
      ...overrides,
    },
  }
}

test('无效会话键 / 空内容 / 离线', async () => {
  const a = harness({ routeFromChatKey: () => null })
  assert.equal(await deliverExternal(a.deps), false)
  assert.match(a.events[0].reason, /会话键无效/)

  const b = harness({ text: '  ' })
  assert.equal(await deliverExternal(b.deps), false)
  assert.match(b.events[0].reason, /内容为空/)

  const c = harness({ server: { currentSocket: () => null } })
  assert.equal(await deliverExternal(c.deps), false)
  assert.match(c.events[0].reason, /不在线/)
})

test('发送成功写 info trace', async () => {
  let route
  const h = harness({ replyTo: async (r, body) => { route = [r, body]; return true } })
  assert.equal(await deliverExternal(h.deps), true)
  assert.deepEqual(route, [{ bot: {}, messageType: 'group', targetId: 9 }, 'hi'])
  assert.equal(h.events[0].ok, true)
  assert.equal(h.events[0].level, 'info')
})

test('出站被拦：warn + false', async () => {
  const h = harness({ replyTo: async () => false })
  assert.equal(await deliverExternal(h.deps), false)
  assert.equal(h.events[0].level, 'warn')
  assert.match(h.events[0].reason, /拦下/)
})

test('发送抛错：error + false', async () => {
  const h = harness({ replyTo: async () => { throw new Error('ws') } })
  assert.equal(await deliverExternal(h.deps), false)
  assert.equal(h.events[0].level, 'error')
  assert.match(h.events[0].reason, /发送失败/)
})
