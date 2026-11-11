import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { hooks } from '../index.js'
import { registerOwnerTools } from '../owner.js'
import { registerQueryTools } from '../query.js'

test('contacts：hooks 暴露 identity/owner/query 注册器', () => {
  assert.deepEqual(Object.keys(hooks).sort(), ['registerIdentityTools', 'registerOwnerTools', 'registerQueryTools'])
  assert.ok(Object.values(hooks).every((fn) => typeof fn === 'function'))
})

test('contacts：owner 专属工具对非主人拒绝', async () => {
  const tools = []
  registerOwnerTools({
    defineTool: (tool) => tool,
    agentCtx: { tools: { register: (tool) => tools.push(tool) } },
    route: { targetId: '2' }, key: 'u:2', role: 'guest',
    bridge: { ownerQQ: () => '1', config: {} },
    debugLog: () => {},
  })
  const digest = tools.find((tool) => tool.name === 'qq_chat_digest')
  assert.ok(digest)
  const result = await digest.execute({})
  assert.deepEqual(result, { ok: false, detail: '这个只跟主人说' })
})

test('contacts：主人没有其它记录时返回空提示', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qq-contacts-'))
  try {
    const tools = []
    registerOwnerTools({
      defineTool: (tool) => tool,
      agentCtx: { tools: { register: (tool) => tools.push(tool) } },
      route: { targetId: '1' }, key: 'u:1', role: 'owner',
      bridge: { ownerQQ: () => '1', contacts: () => ({}), memoryDir: dir, config: {} },
      debugLog: () => {},
    })
    const digest = tools.find((tool) => tool.name === 'qq_chat_digest')
    const result = await digest.execute({})
    assert.match(result.detail, /没有找到其它窗口的对话记录/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('contacts：主人按 chat 取素材并截断输出', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qq-contacts-'))
  try {
    writeFileSync(join(dir, 'u_2.json'), JSON.stringify({
      history: [
        { role: 'user', text: 'hello there', ts: Date.now() },
        { role: 'assistant', text: 'hi', ts: Date.now() },
      ],
    }), 'utf8')
    const tools = []
    registerOwnerTools({
      defineTool: (tool) => tool,
      agentCtx: { tools: { register: (tool) => tools.push(tool) } },
      route: { targetId: '1' }, key: 'u:1', role: 'owner',
      bridge: { ownerQQ: () => '1', contacts: () => ({}), memoryDir: dir, config: {} },
      debugLog: () => {},
    })
    const digest = tools.find((tool) => tool.name === 'qq_chat_digest')
    const result = await digest.execute({ chat: '2', limit: 1 })
    assert.match(result.detail, /【2】/)
    assert.match(result.detail, /hi/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('contacts：历史搜索无命中时返回空结果', async () => {
  const tools = []
  registerQueryTools({
    defineTool: (tool) => tool,
    agentCtx: { tools: { register: (tool) => tools.push(tool) } },
    route: { messageType: 'private', targetId: 1 }, key: 'u:1', role: 'owner',
    bridge: {
      config: { historyQueryEnabled: false, historySearchEnabled: true, historySearchDays: 7, historySearchLimit: 20, botQq: 9 },
      chatKeyOf: () => 'u:1',
      injectionSuppressed: () => false,
      archive: { search: () => ({ hits: [], scanned: 0 }) },
    },
    debugLog: () => {},
  })
  const tool = tools.find((item) => item.name === 'qq_search_history')
  assert.ok(tool)
  const result = await tool.execute({ keywords: '找不到' })
  assert.equal(result.count, 0)
  assert.match(result.detail, /没有找到/)
})

test('contacts：历史搜索命中时返回格式化结果', async () => {
  const tools = []
  registerQueryTools({
    defineTool: (tool) => tool,
    agentCtx: { tools: { register: (tool) => tools.push(tool) } },
    route: { messageType: 'private', targetId: 1 }, key: 'u:1', role: 'owner',
    bridge: {
      config: { historyQueryEnabled: false, historySearchEnabled: true, historySearchDays: 7, historySearchLimit: 20, botQq: 9 },
      chatKeyOf: () => 'u:1',
      injectionSuppressed: () => false,
      archive: { search: () => ({ hits: [{ userId: 2, name: 'A', ts: Date.now(), text: 'hello' }], scanned: 1 }) },
    },
    debugLog: () => {},
  })
  const tool = tools.find((item) => item.name === 'qq_search_history')
  const result = await tool.execute({ keywords: 'hello' })
  assert.equal(result.count >= 1, true)
  assert.match(result.detail, /hello/)
})

test('contacts：owner 的 qq_list_chats 列出记录条数', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qq-contacts-'))
  try {
    writeFileSync(join(dir, 'u_2.json'), JSON.stringify({
      history: [{ role: 'user', text: 'hello', ts: Date.now() }],
    }), 'utf8')
    const tools = []
    registerOwnerTools({
      defineTool: (tool) => tool,
      agentCtx: { tools: { register: (tool) => tools.push(tool) } },
      route: { targetId: '1' }, key: 'u:1', role: 'owner',
      bridge: { ownerQQ: () => '1', contacts: () => ({}), memoryDir: dir, config: {} },
      debugLog: () => {},
    })
    const list = tools.find((tool) => tool.name === 'qq_list_chats')
    const result = await list.execute({})
    assert.match(result.detail, /记录 1 条/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('contacts：owner 聊天列表为空时返回空提示', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qq-contacts-'))
  try {
    const tools = []
    registerOwnerTools({
      defineTool: (tool) => tool,
      agentCtx: { tools: { register: (tool) => tools.push(tool) } },
      route: { targetId: '1' }, key: 'u:1', role: 'owner',
      bridge: { ownerQQ: () => '1', contacts: () => ({}), memoryDir: dir, config: {} },
      debugLog: () => {},
    })
    const list = tools.find((tool) => tool.name === 'qq_list_chats')
    const result = await list.execute({})
    assert.match(result.detail, /还没有任何聊天记录/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('contacts：无 OneBot 连接时历史查询明确报错', async () => {
  const tools = []
  registerQueryTools({
    defineTool: (tool) => tool,
    agentCtx: { tools: { register: (tool) => tools.push(tool) } },
    route: { messageType: 'private', targetId: 1 }, key: 'u:1', role: 'owner',
    bridge: {
      config: { historyQueryEnabled: true, botQq: 9 },
      server: { currentSocket: () => null },
    },
    debugLog: () => {},
  })
  const tool = tools.find((item) => item.name === 'qq_recent_history')
  assert.ok(tool)
  await assert.rejects(() => tool.execute({ count: 3 }), /当前无可用 OneBot 连接/)
})

test('contacts：群成员查询成功返回结果', async () => {
  const tools = []
  registerQueryTools({
    defineTool: (tool) => tool,
    agentCtx: { tools: { register: (tool) => tools.push(tool) } },
    route: { messageType: 'group', targetId: 2002 }, key: 'g:2002', role: 'owner',
    bridge: {
      config: { memberQueryEnabled: true, botQq: 9, historyQueryEnabled: false },
      queryGroupMembers: async (groupId, query) => ({ ok: true, text: `group=${groupId} kind=${query.kind}` }),
    },
    debugLog: () => {},
  })
  const tool = tools.find((item) => item.name === 'qq_member_info')
  assert.ok(tool)
  const result = await tool.execute({ query: '' })
  assert.deepEqual(result, { found: true, detail: 'group=2002 kind=list' })
})

test('contacts：群成员查询失败时返回原因', async () => {
  const tools = []
  registerQueryTools({
    defineTool: (tool) => tool,
    agentCtx: { tools: { register: (tool) => tools.push(tool) } },
    route: { messageType: 'group', targetId: 2002 }, key: 'g:2002', role: 'guest',
    bridge: {
      config: { memberQueryEnabled: true, historyQueryEnabled: false },
      queryGroupMembers: async () => ({ ok: false, reason: '权限不足' }),
    },
    debugLog: () => {},
  })
  const tool = tools.find((item) => item.name === 'qq_member_info')
  const result = await tool.execute({ query: '2' })
  assert.deepEqual(result, { found: false, detail: '没有查到：权限不足' })
})

test('contacts：dry-run 历史查询返回明确说明', async () => {
  const tools = []
  registerQueryTools({
    defineTool: (tool) => tool,
    agentCtx: { tools: { register: (tool) => tools.push(tool) } },
    route: { messageType: 'private', targetId: 1 }, key: 'u:1', role: 'owner',
    bridge: {
      config: { historyQueryEnabled: true, botQq: 9 },
      server: {
        currentSocket: () => ({ id: 'sock' }),
        getFriendMsgHistory: async () => ({ dryRun: true }),
      },
    },
    debugLog: () => {},
  })
  const tool = tools.find((item) => item.name === 'qq_recent_history')
  const result = await tool.execute({ count: 3 })
  assert.equal(result.count, 0)
  assert.match(result.detail, /dry-run/)
})
