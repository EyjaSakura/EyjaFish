import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { hooks } from '../index.js'
import { registerOwnerTools } from '../owner.js'

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
