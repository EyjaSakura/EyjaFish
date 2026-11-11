import test from 'node:test'
import assert from 'node:assert/strict'
import { hooks as contacts } from '../../features/contacts/index.js'
import { hooks as douyin } from '../../features/douyin/index.js'
import { hooks as pvz } from '../../features/pvz/index.js'
import { hooks as ark } from '../../features/ark/index.js'

function harness() {
  const names = []
  const agentCtx = { tools: { register: (def) => names.push(def.name) } }
  const base = {
    config: {
      adminUsers: [], allowUsers: [], allowGroups: [], ownerQQ: '1',
      douyinTier: 'free', pvzEnabled: true, arkEnabled: true,
    },
    server: { currentSocket: () => null, action: async () => ({}) },
    sendRoots: () => ['D:/w'],
    ttsUsable: () => true,
    ownerQQ: () => '1',
    drawAllowed: () => false,
  }
  const bridge = new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop]
      return () => undefined
    },
  })
  const ctx = {
    agentCtx, bridge,
    defineTool: (def) => def,
    route: { messageType: 'private', targetId: 1 },
    key: 'u:1',
    role: { cwd: 'D:/w', guest: false, subjectId: 'u:1' },
    debugLog: () => {},
  }
  return { names, ctx }
}

test('contacts 注册 6 个身份工具', () => {
  const { names, ctx } = harness()
  contacts.registerIdentityTools(ctx)
  assert.deepEqual([...names].sort(), [
    'qq_contact_taste', 'qq_quote_reply', 'qq_report_identity',
    'qq_send_to_user', 'qq_set_activity', 'qq_set_friend_remark',
  ])
})

test('douyin 注册 10 个工具', () => {
  const { names, ctx } = harness()
  douyin.registerDouyinTools(ctx)
  assert.equal(names.length, 10)
  for (const n of ['douyin_send', 'douyin_send_image', 'douyin_analyze_video']) assert.ok(names.includes(n), n)
})

test('pvz 注册 8 个工具', () => {
  const { names, ctx } = harness()
  pvz.registerPvzTools(ctx)
  assert.equal(names.length, 8)
  for (const n of ['pvz_status', 'pvz_plant', 'pvz_collect']) assert.ok(names.includes(n), n)
})

test('ark 注册 3 个工具', () => {
  const { names, ctx } = harness()
  ark.registerArkTools(ctx)
  assert.deepEqual([...names].sort(), ['ark_run', 'ark_status', 'ark_stop'])
})
