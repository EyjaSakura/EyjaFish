import test from 'node:test'
import assert from 'node:assert/strict'

import { registerDouyinTools } from '../douyin-tools.js'

test('douyin：注册私信/feed/分析/分享工具', () => {
  const tools = []
  registerDouyinTools({
    defineTool: (tool) => tool,
    agentCtx: { tools: { register: (tool) => tools.push(tool) } },
    route: {}, key: 'u:1', role: 'owner',
    bridge: {}, debugLog: () => {},
  })
  const names = tools.map((tool) => tool.name)
  for (const name of ['douyin_send', 'douyin_feed', 'douyin_analyze_video', 'douyin_send_image']) {
    assert.ok(names.includes(name), `missing ${name}`)
  }
})
