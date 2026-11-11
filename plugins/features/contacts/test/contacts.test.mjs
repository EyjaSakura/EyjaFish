import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { hooks } from '../index.js'
import { registerOwnerTools } from '../owner.js'
import { registerQueryTools } from '../query.js'

test('contacts：hooks 暴露 identity/owner/query 注册器', () => {
  assert.deepEqual(Object.keys(hooks).sort(), ['registerIdentityTools', 'registerOwnerTools', 'registerQueryTools'])
  assert.ok(Object.values(hooks).every((fn) => typeof fn === 'function'))
})

test('contacts：owner 专属工具对非主人拒绝', async () => {
  const tools = []
  registerOwnerTools({
    defineTool: (tool) => tool,
    agentCtx: { tools: { register: (tool) => tools.push(tool) } },
    route: { targetId: '2' }, key: 'u:2', role: 'guest',
    bridge: { ownerQQ: () => '1', config: {} },
    debugLog: () => {},
  })
  const digest = tools.find((tool) => tool.name === 'qq_chat_digest')
  assert.ok(digest)
  const result = await digest.execute({})
  assert.deepEqual(result, { ok: false, detail: '这个只跟主人说' })
})

test('contacts：主人没有其它记录时返回空提示', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qq-contacts-'))
  try {
    const tools = []
    registerOwnerTools({
      defineTool: (tool) => tool,
      agentCtx: { tools: { register: (tool) => tools.push(tool) } },
      route: { targetId: '1' }, key: 'u:1', role: 'owner',
      bridge: { ownerQQ: () => '1', contacts: () => ({}), memoryDir: dir, config: {} },
      debugLog: () => {},
    })
    const digest = tools.find((tool) => tool.name === 'qq_chat_digest')
    const result = await digest.execute({})
    assert.match(result.detail, /没有找到其它窗口的对话记录/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('contacts：主人按 chat 取素材并截断输出', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qq-contacts-'))
  try {
    writeFileSync(join(dir, 'u_2.json'), JSON.stringify({
      history: [
        { role: 'user', text: 'hello there', ts: Date.now() },
        { role: 'assistant', text: 'hi', ts: Date.now() },
      ],
    }), 'utf8')
    const tools = []
    registerOwnerTools({
      defineTool: (tool) => tool,
      agentCtx: { tools: { register: (tool) => tools.push(tool) } },
      route: { targetId: '1' }, key: 'u:1', role: 'owner',
      bridge: { ownerQQ: () => '1', contacts: () => ({}), memoryDir: dir, config: {} },
      debugLog: () => {},
    })
    const digest = tools.find((tool) => tool.name === 'qq_chat_digest')
    const result = await digest.execute({ chat: '2', limit: 1 })
    assert.match(result.detail, /【2】/)
    assert.match(result.detail, /hi/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('contacts：无 OneBot 连接时历史查询明确报错', async () => {
  const tools = []
  registerQueryTools({
    defineTool: (tool) => tool,
    agentCtx: { tools: { register: (tool) => tools.push(tool) } },
    route: { messageType: 'private', targetId: 1 }, key: 'u:1', role: 'owner',
    bridge: {
      config: { historyQueryEnabled: true, botQq: 9 },
      server: { currentSocket: () => null },
    },
    debugLog: () => {},
  })
  const tool = tools.find((item) => item.name === 'qq_recent_history')
  assert.ok(tool)
  await assert.rejects(() => tool.execute({ count: 3 }), /当前无可用 OneBot 连接/)
})
