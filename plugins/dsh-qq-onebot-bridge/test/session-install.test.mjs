import test from 'node:test'
import assert from 'node:assert/strict'
import { installSession } from '../lib/session-install.js'

function makeHarness({ key = 'u:2', allowUsers = [2], adminUsers = [] } = {}) {
  const order = []
  const toolNames = []
  const sections = []
  const bridge = {
    config: {
      allowUsers,
      adminUsers,
      visionMode: 'tool',
      visionToolName: 'read_image',
      agentMediaToolsEnabled: false,
      historyQueryEnabled: false,
      memberQueryEnabled: false,
      reactToolEnabled: false,
      sttEnabled: false,
    },
    roleOf: () => ({ guest: true, cwd: 'D:/guest' }),
    toolSurface: () => ({ decisions: {}, subject: 'user:' + key.slice(2), sharedRead: false, needRestrict: false, inheritedTools: [] }),
    ownerQQ: () => '1',
    personaEnabled: () => false,
    sendRoots: () => ['D:/guest'],
    loadMemoryLines: () => [],
    registerCorpusSection: () => order.push('corpus'),
    applyToolSurface: async () => order.push('surface'),
    registerSelfTools: () => order.push('self'),
    registerContactsSection: () => order.push('contactsSection'),
    registerIdentitySection: () => order.push('identitySection'),
    registerIdentityTools: () => order.push('identityTools'),
    registerDouyinTools: () => order.push('douyin'),
    registerPvzTools: () => order.push('pvz'),
    registerArkTools: () => order.push('ark'),
    registerOwnerTools: () => order.push('owner'),
  }
  const agentCtx = {
    tools: { register: (def) => toolNames.push(def.name) },
    systemPrompt: { section: (s) => sections.push(s.name) },
  }
  return { bridge, agentCtx, order, toolNames, sections }
}

const route = { messageType: 'private', targetId: 2 }

test('安装顺序：surface → self → contacts/identity/douyin/pvz/ark/owner', async () => {
  const { bridge, agentCtx, order } = makeHarness()
  await installSession({ agentCtx, route, key: 'u:2', opts: { role: { guest: true, cwd: 'D:/guest' } }, bridge, defineTool: (d) => d, debugLog: () => {} })
  assert.deepEqual(order, ['corpus', 'surface', 'self', 'contactsSection', 'identitySection', 'identityTools', 'douyin', 'pvz', 'ark', 'owner'])
})

test('白名单非主人补注册 qq_send_voice', async () => {
  const { bridge, agentCtx, toolNames } = makeHarness({ key: 'u:2', allowUsers: [2] })
  await installSession({ agentCtx, route, key: 'u:2', opts: { role: {} }, bridge, defineTool: (d) => d, debugLog: () => {} })
  assert.ok(toolNames.includes('qq_send_voice'))
})

test('主人不补注册 qq_send_voice', async () => {
  const { bridge, agentCtx, toolNames } = makeHarness({ key: 'u:1', allowUsers: [1] })
  await installSession({ agentCtx, route: { messageType: 'private', targetId: 1 }, key: 'u:1', opts: { role: {} }, bridge, defineTool: (d) => d, debugLog: () => {} })
  assert.equal(toolNames.includes('qq_send_voice'), false)
})
