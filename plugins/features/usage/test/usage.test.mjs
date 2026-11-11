import test from 'node:test'
import assert from 'node:assert/strict'

import { registerUsageTools } from '../usage-tools.js'

test('usage：注册 qq_usage_report', () => {
  const tools = []
  registerUsageTools({
    defineTool: (tool) => tool,
    agentCtx: { tools: { register: (tool) => tools.push(tool) } },
    route: {}, key: 'u:1', role: 'owner',
    bridge: {}, debugLog: () => {},
  })
  assert.deepEqual(tools.map((tool) => tool.name), ['qq_usage_report'])
})
