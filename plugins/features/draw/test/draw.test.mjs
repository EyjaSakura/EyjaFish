import test from 'node:test'
import assert from 'node:assert/strict'

import { registerFeature } from '../draw-tools.js'

test('draw：注册 qq_draw', () => {
  const tools = []
  registerFeature({
    defineTool: (tool) => tool,
    agentCtx: { tools: { register: (tool) => tools.push(tool) } },
    route: { targetId: 1 },
    key: 'u:1',
    bridge: { drawAllowed: () => false },
  })
  assert.deepEqual(tools.map((tool) => tool.name), ['qq_draw'])
})

test('draw：非主人/倩倩姐直接拒绝，不生成图片', async () => {
  const tools = []
  registerFeature({
    defineTool: (tool) => tool,
    agentCtx: { tools: { register: (tool) => tools.push(tool) } },
    route: { targetId: 2 },
    key: 'u:2',
    bridge: {
      drawAllowed: () => false,
      generateImage: async () => { throw new Error('不应调用生图') },
    },
  })
  const result = await tools[0].execute({ prompt: '猫' })
  assert.deepEqual(result, { ok: false, detail: '生图只对主人和倩倩姐开放' })
})
