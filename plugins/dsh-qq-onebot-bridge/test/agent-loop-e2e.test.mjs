import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import WebSocket from 'ws'
import { OneBotServer } from '../lib/onebot-server.js'
import { handoff } from '../lib/core/handoff.js'
import { replyTo } from '../lib/reply-router.js'

const logger = { info: () => {}, warn: () => {}, error: () => {} }

function makeBridge(server) {
  const bridge = {
    server,
    config: { faceEnabled: false, maxMessageLength: 4000 },
    chatKeyOf: () => 'u:5',
    typingSent: new Map(),
    typingStopFor: async () => {},
    injectionSuppressed: () => false,
    markSuppressed: () => {},
    sessions: new Map(),
    rateLimited: () => false,
    shouldForward: () => false,
    faces: { expandMarkers: (t) => [{ type: 'text', data: { text: t } }] },
    pushRecentMsg: () => {},
    trackSent: () => {},
    trace: { event: () => {} },
  }
  bridge.replyTo = (route, text, opts) => replyTo({ route, text, opts, bridge, defineTool: null, debugLog: () => {} })
  return bridge
}

test('fake-agent e2e：handoff → 假模型回复 → 真实 WS 出站', async (t) => {
  const server = new OneBotServer({ host: '127.0.0.1', port: 0, accessToken: 'tok' }, logger)
  await server.start()
  t.after(async () => { await server.stop() })
  const { port } = server.address()
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { Authorization: 'Bearer tok' } })
  await once(ws, 'open')

  const sent = []
  ws.on('message', (buf) => {
    const m = JSON.parse(buf.toString())
    if (m.action === 'send_private_msg') {
      sent.push(m.params.message.map((s) => s.data.text).join(''))
      ws.send(JSON.stringify({ status: 'ok', retcode: 0, echo: m.echo, data: { message_id: sent.length } }))
    }
  })

  const bridge = makeBridge(server)
  const route = { bot: server.currentSocket(), messageType: 'private', targetId: 5 }
  const entry = {
    pendingTurns: [],
    lastTraceId: 't1',
    key: 'u:5',
    handle: {
      agent: {
        followup: async (msg) => {
          // 假模型：把用户内容变成一句回复
          const text = '收到：' + msg.content
          await bridge.replyTo(route, text, {})
          return { text }
        },
      },
    },
  }

  await handoff({
    entry,
    message: { text: '你好' },
    payload: { content: '你好' },
    trace: bridge.trace,
    createUserMessage: (payload) => ({ role: 'user', ...payload }),
  })

  assert.deepEqual(sent, ['收到：你好'])
  assert.equal(entry.pendingTurns.length, 1)
  assert.equal(entry.pendingTurns[0].injected, false)
  ws.close()
})
