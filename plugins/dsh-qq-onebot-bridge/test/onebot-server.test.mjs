import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import WebSocket from 'ws'
import { OneBotServer } from '../lib/onebot-server.js'

const logger = { info: () => {}, warn: () => {}, error: () => {} }

function frame(text) {
  return {
    post_type: 'message',
    message_type: 'private',
    self_id: 1,
    user_id: 5,
    message_id: 123,
    time: Math.floor(Date.now() / 1000),
    raw_message: text,
    message: [{ type: 'text', data: { text } }],
    sender: { user_id: 5, nickname: 'tester' },
  }
}

test('反向 WS：鉴权 + 私聊消息解析成 message 事件', async (t) => {
  const server = new OneBotServer({ host: '127.0.0.1', port: 0, accessToken: 'tok', botQq: 1 }, logger)
  const started = await server.start()
  assert.equal(started.ok, true)
  t.after(async () => { await server.stop() })

  const { port } = server.address()
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { Authorization: 'Bearer tok' } })
  await once(ws, 'open')

  const received = once(server, 'message')
  ws.send(JSON.stringify(frame('你好')))
  const [msg] = await received

  assert.equal(msg.text, '你好')
  assert.equal(msg.userId, 5)
  assert.equal(msg.messageType, 'private')
  ws.close()
})

test('反向 WS：错误 token 被拒绝', async (t) => {
  const server = new OneBotServer({ host: '127.0.0.1', port: 0, accessToken: 'tok' }, logger)
  await server.start()
  t.after(async () => { await server.stop() })
  const { port } = server.address()
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { Authorization: 'Bearer bad' } })
  const [code] = await once(ws, 'close')
  assert.equal(code, 4001)
})


test('action 往返：ws 客户端回 echo 后 resolve data', async (t) => {
  const server = new OneBotServer({ host: '127.0.0.1', port: 0, accessToken: 'tok' }, logger)
  await server.start()
  t.after(async () => { await server.stop() })
  const { port } = server.address()
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { Authorization: 'Bearer tok' } })
  await once(ws, 'open')
  ws.on('message', (buf) => {
    const m = JSON.parse(buf.toString())
    if (m.action === 'send_private_msg') {
      ws.send(JSON.stringify({ status: 'ok', retcode: 0, echo: m.echo, data: { message_id: 42 } }))
    }
  })
  const data = await server.action(server.currentSocket(), 'send_private_msg', { user_id: 5, message: [{ type: 'text', data: { text: 'hi' } }] })
  assert.equal(data.message_id, 42)
  ws.close()
})

test('dry-run：action 不发 ws，只记录', async (t) => {
  const server = new OneBotServer({ host: '127.0.0.1', port: 0, accessToken: 'tok' }, logger)
  await server.start()
  t.after(async () => { await server.stop() })
  const { port } = server.address()
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { Authorization: 'Bearer tok' } })
  await once(ws, 'open')
  server.setDryRun(true)
  const data = await server.action(server.currentSocket(), 'send_private_msg', { user_id: 5 })
  assert.equal(data.dryRun, true)
  assert.equal(server.takeDryRunCalls().length, 1)
  ws.close()
})
