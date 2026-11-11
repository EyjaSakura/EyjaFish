import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import WebSocket from 'ws'
import { OneBotServer } from '../lib/onebot-server.js'
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

test('reply-router → 真实 WS：换行拆成两条发送', async (t) => {
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
  await replyTo({ route, text: '第一句\n第二句', opts: {}, bridge, defineTool: null, debugLog: () => {} })

  assert.deepEqual(sent, ['第一句', '第二句'])
  ws.close()
})
