import test from 'node:test'
import assert from 'node:assert/strict'

import { registerArkTools } from '../ark-tools.js'

test('ark：注册 ark_status / ark_run / ark_stop', () => {
  const tools = []
  registerArkTools({
    defineTool: (tool) => tool,
    agentCtx: { tools: { register: (tool) => tools.push(tool) } },
    route: {}, key: 'u:1', role: 'owner',
    bridge: {}, debugLog: () => {},
  })
  assert.deepEqual(tools.map((tool) => tool.name), ['ark_status', 'ark_run', 'ark_stop'])
})
