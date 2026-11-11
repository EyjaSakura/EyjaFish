import test from 'node:test'
import assert from 'node:assert/strict'

import { registerSelfTools } from '../index.js'

test('self：非管理员不注册任何工具', () => {
  const tools = []
  const logs = []
  registerSelfTools({
    defineTool: (tool) => tool,
    agentCtx: { tools: { register: (tool) => tools.push(tool) } },
    route: { targetId: 2 }, key: 'u:2',
    role: { subjectId: 'u:2' },
    bridge: { config: { adminUsers: [1] } },
    debugLog: (line) => logs.push(line),
  })
  assert.equal(tools.length, 0)
  assert.ok(logs.some((line) => line.includes('not admin')))
})
