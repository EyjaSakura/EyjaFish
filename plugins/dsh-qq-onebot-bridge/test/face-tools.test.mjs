import test from 'node:test'
import assert from 'node:assert/strict'
import { registerFaceTools } from '../lib/tools/face-tools.js'

function harness(overrides = {}) {
  const tools = []
  const calls = []
  const bridge = {
    faces: {
      list: () => ({ yellow: [{ name: '微笑' }, { name: '鼓掌' }], saved: [{ name: '猫猫', desc: '可爱' }, { name: '待定', pendingDesc: true }] }),
      resolve: (name) => (name === '猫猫' ? { label: '收藏图[猫猫]', segments: [{ type: 'image' }] } : { label: name, segments: [{ type: 'face' }] }),
    },
    server: { sendSegments: async (...a) => calls.push(['send', ...a]) },
    ...overrides.bridge,
  }
  const agentCtx = { tools: { register: (t) => tools.push(t) } }
  registerFaceTools({
    agentCtx,
    route: { bot: 'b', messageType: 'group', targetId: 9 },
    defineTool: (t) => t,
    bridge,
    chatKeyOf: () => 'g:9',
    linkSticker: (...a) => calls.push(['link', ...a]),
  })
  return { tools, calls }
}

test('注册两个工具', () => {
  const { tools } = harness()
  assert.deepEqual(tools.map((t) => t.name), ['qq_face_list', 'qq_face_send'])
})

test('qq_face_list 渲染', async () => {
  const { tools } = harness()
  const list = tools.find((t) => t.name === 'qq_face_list')
  const out = await list.execute()
  assert.equal(out.count, 4)
  assert.match(out.sample, /微笑/)
  assert.match(out.sample, /猫猫（可爱）/)
  assert.match(out.sample, /待定（未描述，未收藏）/)
})

test('qq_face_send 成功并记录表情', async () => {
  const { tools, calls } = harness()
  const send = tools.find((t) => t.name === 'qq_face_send')
  const out = await send.execute({ name: '猫猫' })
  assert.equal(out.sent, true)
  assert.equal(calls.some((c) => c[0] === 'send'), true)
  assert.deepEqual(calls.find((c) => c[0] === 'link'), ['link', 'g:9', '猫猫'])
})

test('qq_face_send 未知表情抛错', async () => {
  const { tools } = harness({ bridge: { faces: { list: () => ({ yellow: [], saved: [] }), resolve: () => null }, server: { sendSegments: async () => {} } } })
  const send = tools.find((t) => t.name === 'qq_face_send')
  await assert.rejects(() => send.execute({ name: '不存在' }), /unknown face/)
})
