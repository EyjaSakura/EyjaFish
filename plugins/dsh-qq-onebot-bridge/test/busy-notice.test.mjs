import test from 'node:test'
import assert from 'node:assert/strict'
import { sendBusyNotice } from '../lib/services/busy-notice.js'

function harness(overrides = {}) {
  const sent = []
  const state = { at: new Map(), globalAt: 0 }
  return {
    sent,
    state,
    deps: {
      message: { messageType: 'private', userId: 123 },
      stateFile: 'self.json',
      readFile: () => JSON.stringify({ updatedAt: 999_000, activity: '写代码', etaMin: 5 }),
      server: {
        currentSocket: () => ({}),
        sendText: async (sock, type, uid, text) => sent.push([type, uid, text]),
      },
      state,
      now: 1_000_000,
      random: () => 0,
      debugLog: () => {},
      ...overrides,
    },
  }
}

test('非私聊不处理', async () => {
  const h = harness({ message: { messageType: 'group', userId: 1 } })
  await sendBusyNotice(h.deps)
  assert.equal(h.sent.length, 0)
})

test('用户/全局限频', async () => {
  const h = harness()
  h.state.at.set('123', 999_999)
  await sendBusyNotice(h.deps)
  assert.equal(h.sent.length, 0)

  const g = harness()
  g.state.globalAt = 999_999
  await sendBusyNotice(g.deps)
  assert.equal(g.sent.length, 0)
})

test('成功发送并记账', async () => {
  const h = harness()
  await sendBusyNotice(h.deps)
  assert.equal(h.sent.length, 1)
  assert.match(h.sent[0][2], /写代码/)
  assert.equal(h.state.at.get('123'), 1_000_000)
  assert.equal(h.state.globalAt, 1_000_000)
})

test('状态过期用兜底活动与随机 ETA', async () => {
  const h = harness({ readFile: () => JSON.stringify({ updatedAt: 1 }) })
  await sendBusyNotice(h.deps)
  assert.match(h.sent[0][2], /手头这点事/)
})

test('无 socket / sendText 抛错都不抛', async () => {
  const noSock = harness({ server: { currentSocket: () => null, sendText: async () => {} } })
  await sendBusyNotice(noSock.deps)
  assert.equal(noSock.sent.length, 0)

  const bad = harness({ server: { currentSocket: () => ({}), sendText: async () => { throw new Error('x') } } })
  await assert.doesNotReject(() => sendBusyNotice(bad.deps))
})
