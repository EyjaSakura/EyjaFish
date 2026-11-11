import test from 'node:test'
import assert from 'node:assert/strict'

import { registerMediaTools } from '../index.js'

function setup({ ttsUsable = false, writeGate = () => '' } = {}) {
  const tools = []
  const bridge = {
    sendRoots: () => ['D:/allowed'],
    ttsUsable: () => ttsUsable,
    writeGate: () => writeGate(),
    injectionSuppressed: () => false,
    markSuppressed: () => {},
    resolveSendPath: (file) => `resolved:${file}`,
    sendImageTo: async () => 'image-sent',
    sendFileTo: async () => 'file-sent',
    sendVoiceTo: async () => 'voice-sent',
  }
  const agentCtx = { tools: { register: (tool) => tools.push(tool) } }
  registerMediaTools({ defineTool: (tool) => tool, agentCtx, route: {}, key: 'u:1', role: 'owner', bridge })
  return { tools, bridge }
}

test('media：注册发图/发文件/语音文件工具', () => {
  const { tools } = setup()
  assert.deepEqual(tools.map((tool) => tool.name), ['qq_send_image', 'qq_send_file', 'qq_send_voice_file', 'qq_recall'])
})

test('media：TTS 可用时额外注册 qq_send_voice', () => {
  const { tools } = setup({ ttsUsable: true })
  assert.ok(tools.some((tool) => tool.name === 'qq_send_voice'))
})

test('media：权限拒绝时不落盘、不发送', async () => {
  const { tools } = setup({ writeGate: () => '权限不足' })
  const image = tools.find((tool) => tool.name === 'qq_send_image')
  const result = await image.execute({ path: 'x.png' })
  assert.equal(result.sent, false)
  assert.equal(result.detail, '权限不足')
})

test('media：权限通过时走 resolveSendPath + sendImageTo', async () => {
  const { tools, bridge } = setup()
  let resolved = ''
  bridge.resolveSendPath = (file) => { resolved = file; return 'D:/allowed/x.png' }
  const image = tools.find((tool) => tool.name === 'qq_send_image')
  const result = await image.execute({ path: 'x.png', caption: 'cap' })
  assert.equal(resolved, 'x.png')
  assert.deepEqual(result, { sent: true, detail: 'image-sent' })
})
