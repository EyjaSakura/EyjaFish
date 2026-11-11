import test from 'node:test'
import assert from 'node:assert/strict'

import { registerPvzTools } from '../pvz-tools.js'

test('pvz：注册全部只读/操作用具', () => {
  const tools = []
  registerPvzTools({
    defineTool: (tool) => tool,
    agentCtx: { tools: { register: (tool) => tools.push(tool) } },
    route: {}, key: 'u:1', role: 'owner',
    bridge: {}, debugLog: () => {},
  })
  const names = tools.map((tool) => tool.name)
  for (const name of ['pvz_status', 'pvz_observe', 'pvz_plant', 'pvz_shovel', 'pvz_collect', 'pvz_fuse', 'pvz_ready', 'pvz_autoplay']) {
    assert.ok(names.includes(name), `missing ${name}`)
  }
  assert.ok(tools.every((tool) => typeof tool.execute === 'function'))
})
