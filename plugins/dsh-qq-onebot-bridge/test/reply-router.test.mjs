import test from 'node:test'
import assert from 'node:assert/strict'
import { replyTo } from '../lib/reply-router.js'

function makeBridge() {
  const sent = []
  const bridge = {
    chatKeyOf: () => 'k',
    typingSent: new Map(),
    typingStopFor: async () => {},
    injectionSuppressed: () => false,
    markSuppressed: () => {},
    sessions: new Map(),
    rateLimited: () => false,
    shouldForward: () => false,
    config: { faceEnabled: false, maxMessageLength: 4000 },
    faces: { expandMarkers: (t) => [{ type: 'text', data: { text: t } }] },
    server: {
      sendSegments: async (bot, type, target, segs) => {
        sent.push(segs.map((s) => s.data.text).join(''))
        return { message_id: sent.length }
      },
    },
    pushRecentMsg: () => {},
    trackSent: () => {},
    trace: { event: () => {} },
  }
  bridge.replyTo = (route, text, opts) => replyTo({ route, text, opts, bridge, defineTool: null, debugLog: () => {} })
  return { bridge, sent }
}

const route = { bot: null, messageType: 'private', targetId: 1 }

test('固定格式整条发、不改写', async () => {
  const { bridge, sent } = makeBridge()
  const text = '【模型用量】2026/11/8 ｜ 大肥鱼：输入0/输出0 ¥0.00 ｜ 合计：0 ¥0.00'
  await bridge.replyTo(route, text)
  assert.equal(sent.length, 1)
  assert.equal(sent[0], text)
})

test('普通换行会拆条', async () => {
  const { bridge, sent } = makeBridge()
  await bridge.replyTo(route, '第一句\n第二句')
  assert.equal(sent.length, 2)
  assert.deepEqual(sent, ['第一句', '第二句'])
})

test('感叹号转口牙、问号删除', async () => {
  const { bridge, sent } = makeBridge()
  await bridge.replyTo(route, '你好！在吗？')
  assert.equal(sent.length, 1)
  assert.match(sent[0], /口牙/)
  assert.doesNotMatch(sent[0], /[！？]/)
})


test('限流时入 outbox，不直接发送', async () => {
  const { bridge, sent } = makeBridge()
  const queued = []
  bridge.rateLimited = () => true
  bridge.enqueueOutbox = (key, route, text) => queued.push({ key, text })
  bridge.rateNoticeMap = new Map()
  bridge.server.action = async () => ({})
  await bridge.replyTo(route, '测试限流')
  assert.equal(sent.length, 0)
  assert.equal(queued.length, 1)
  assert.equal(queued[0].text, '测试限流')
})
