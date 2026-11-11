import test from 'node:test'
import assert from 'node:assert/strict'

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
