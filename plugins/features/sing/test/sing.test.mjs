import test from 'node:test'
import assert from 'node:assert/strict'

import { registerSingTools } from '../index.js'

test('sing：注册 qq_sing', () => {
  const tools = []
  registerSingTools({
    defineTool: (tool) => tool,
    agentCtx: { tools: { register: (tool) => tools.push(tool) } },
    route: {}, key: 'u:1', role: 'owner',
    bridge: { injectionSuppressed: () => false, markSuppressed: () => {} },
    debugLog: () => {},
  })
  assert.deepEqual(tools.map((tool) => tool.name), [
    'qq_sing', 'qq_sing_list', 'qq_sing_rejected', 'qq_sing_lyrics',
    'qq_sing_save_sections', 'qq_sing_incoming', 'qq_sing_ingest',
  ])
})
