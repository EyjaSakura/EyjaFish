import test from 'node:test'
import assert from 'node:assert/strict'
import { hooks as drawHooks } from '../../features/draw/index.js'
import { registerMediaTools } from '../../features/media/index.js'

function ctx() {
  const names = []
  return {
    names,
    agentCtx: { tools: { register: (def) => names.push(def.name) } },
    defineTool: (def) => def,
    route: { messageType: 'private', targetId: 1 },
    key: 'u:1',
    role: { cwd: 'D:/w', guest: false },
  }
}

test('draw 插件注册 qq_draw，权限由 bridge.drawAllowed 决定', async () => {
  const { agentCtx, defineTool, route, key, role } = ctx()
  const tools = []
  const capture = { tools: { register: (def) => tools.push(def) } }
  const bridge = { drawAllowed: () => false }
  drawHooks.registerFeature({ agentCtx: capture, defineTool, route, key, role, bridge })
  assert.equal(tools.length, 1)
  assert.equal(tools[0].name, 'qq_draw')
  const out = await tools[0].execute({ prompt: '猫' })
  assert.equal(out.ok, false)
  assert.match(out.detail, /只对主人/)
})

test('media 插件注册 5 个工具', () => {
  const { agentCtx, defineTool, route, key, role, names } = ctx()
  const bridge = { sendRoots: () => ['D:/w'], ttsUsable: () => true }
  registerMediaTools({ agentCtx, defineTool, route, key, role, bridge })
  assert.deepEqual([...names].sort(), ['qq_recall', 'qq_send_file', 'qq_send_image', 'qq_send_voice', 'qq_send_voice_file'])
})
