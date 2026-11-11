import test from 'node:test'
import assert from 'node:assert/strict'

import { registerMemoryTools } from '../index.js'

test('memory：USE_V2 开启时注册检索/时间线工具', () => {
  const tools = []
  registerMemoryTools({
    defineTool: (tool) => tool,
    agentCtx: { tools: { register: (tool) => tools.push(tool) } },
    key: 'u:1',
    debugLog: () => {},
  })
  assert.deepEqual(tools.map((tool) => tool.name), ['memory_search', 'memory_timeline'])
})
