import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { QQBridge } from '../../lib/bridge.js'

function fakeBridge() {
  const bridge = Object.create(QQBridge.prototype)
  const writes = []
  Object.assign(bridge, {
    config: { groupOpsEnabled: true, opsReportEnabled: true, adminEnabled: true },
    opsCounters: { bump: (...args) => writes.push(['bump', ...args]) },
    engagementRuntime: { saveOps: () => writes.push(['saveOps']) },
    broadcast: { snapshot: () => ({ ok: true }) },
    broadcastState: { write: (data) => writes.push(['broadcast', data]) },
    injectionRuntime: { injectedTaskBlocked: () => 'blocked' },
    botAdminKnown: new Map(),
    botAdminKnownAt: 0,
  })
  return { bridge, writes }
}

test('bridge 核心薄方法：countOps / broadcast / 注入判断', () => {
  const { bridge, writes } = fakeBridge()
  bridge.countOps('sign', 2)
  assert.deepEqual(writes[0], ['bump', 'sign', 2])
  assert.deepEqual(writes[1], ['saveOps'])
  bridge.saveBroadcastState()
  assert.deepEqual(writes[2], ['broadcast', { ok: true }])
  assert.equal(bridge.injectedTaskBlockedFor({}, 'test'), 'blocked')
})

test('bridge 核心薄方法：botAdminBlockedReason 未命中时不拦截', () => {
  const { bridge } = fakeBridge()
  assert.equal(bridge.botAdminBlockedReason(123), '')
})

test('bridge 核心：/health 报告走 safeReply', async () => {
  const { bridge } = fakeBridge()
  let reply = ''
  Object.assign(bridge, {
    pluginVersion: '0.8.0',
    config: {
      botQq: 1, visionMode: 'native', visionToolName: 'describe_image',
      sttEnabled: false, ttsEnabled: false, sessionResumeEnabled: false,
      actionAuditEnabled: false, quietHoursEnabled: false, quietHours: [], quietWeekendExempt: false,
    },
    sessions: new Map([['u:1', { sessionId: 'abcdef123' }]]),
    reminders: new Map(),
    votes: new Map(),
    gate: { denied: 0 },
    sessionStore: { read: () => ({}) },
    loadMemoryLines: () => [],
    routeKey: () => 'u:1',
    safeReply: async (_m, text) => { reply = text },
  })
  await bridge.handleHealth({ messageType: 'private', userId: 1 })
  assert.match(reply, /插件版本：0\.8\.0/)
  assert.match(reply, /当前会话：abcdef12/)
})

test('bridge 核心：路由 / 主体 / 会话薄包装', () => {
  const { bridge } = fakeBridge()
  assert.equal(bridge.subjectOfChatFor({ messageType: 'private', userId: 1 }), 'user:1')
  assert.equal(bridge.subjectOfSenderFor({ messageType: 'private', userId: 2 }), 'user:2')
  assert.equal(bridge.isWriterHeldFor({ name: 'SessionAlreadyOwnedError' }), true)
  assert.equal(bridge.isWriterHeldFor(new Error('x')), false)

  bridge.sessionMaintenanceRuntime = { storedSessionId: () => 's1' }
  assert.equal(bridge.storedSessionIdFor('u:1'), 's1')

  const mutated = []
  bridge.sessionStore = { mutate: (fn) => { const d = { 'u:1': 1 }; fn(d); mutated.push(d) } }
  bridge.forgetSession('u:1')
  assert.deepEqual(mutated[0], {})

  bridge.sessionBindRuntime = { bind: (...args) => args }
  assert.deepEqual(bridge.bindSessionFor('u:1', 's1'), ['u:1', 's1', 'open'])
})

test('bridge 核心：未知能力 / 限额读取失败兜底', () => {
  const { bridge } = fakeBridge()
  bridge.config = {}
  bridge.subjectOfChatFor = () => 'user:1'
  bridge.subjectOfSenderFor = () => 'user:1'
  bridge.aclPolicy = () => ({})
  const unknown = bridge.canRun({ messageType: 'private', userId: 1 }, 'no-such-capability', {})
  assert.equal(unknown.allowed, false)
  assert.equal(unknown.reason, 'unknown-capability')

  bridge.aclPolicy = () => { throw new Error('bad policy') }
  assert.deepEqual(bridge.chatLimits({ messageType: 'private', userId: 1 }, ['x']), {})
})

test('bridge 核心：bot 掉线会清会话并通知', () => {
  const { bridge } = fakeBridge()
  const socket = { id: 'sock' }
  const cancelled = []
  const disposed = []
  const notified = []
  const sessions = new Map()
  const entry = {
    key: 'u:1',
    sessionId: 's1',
    route: { bot: socket },
    handle: {
      agent: { cancel: (opts) => cancelled.push(opts) },
      dispose: async () => disposed.push(true),
    },
  }
  sessions.set('u:1', entry)
  Object.assign(bridge, {
    sessions,
    agents: new Map([['s1', {}]]),
    notify: (text) => notified.push(text),
    writeRuntimeSnapshot: () => {},
    tryAutoHeal: () => { bridge.healed = true },
  })
  bridge.onBotDisconnect(socket)
  assert.equal(bridge.botOnline, false)
  assert.equal(sessions.has('u:1'), false)
  assert.equal(bridge.agents.has('s1'), false)
  assert.deepEqual(cancelled, [{ kind: 'user' }])
  assert.match(notified[0], /QQ 机器人掉线/)
  assert.equal(bridge.healed, true)
})

test('bridge 核心：空会话导出走 safeReply', async () => {
  const { bridge } = fakeBridge()
  let reply = ''
  bridge.routeKey = () => 'u:1'
  bridge.loadMemoryLines = () => []
  bridge.safeReply = async (_m, text) => { reply = text }
  await bridge.handleExport({ messageType: 'private', userId: 1 })
  assert.match(reply, /没有可导出的记录/)
})

test('bridge 核心：有记录时导出文件并回复路径', async () => {
  const { bridge } = fakeBridge()
  const dir = mkdtempSync(join(tmpdir(), 'qq-export-'))
  let reply = ''
  try {
    Object.assign(bridge, {
      exportsDir: dir,
      routeKey: () => 'u:1',
      loadMemoryLines: () => ['a', 'b'],
      safeReply: async (_m, text) => { reply = text },
    })
    await bridge.handleExport({ messageType: 'private', userId: 1 })
    assert.match(reply, /已导出 2 条记录/)
    const file = reply.split('：').pop()
    assert.match(readFileSync(file, 'utf8'), /# u:1 聊天记录导出/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('bridge 核心：无待审批验证时 join answer 直接返回 false', async () => {
  const { bridge } = fakeBridge()
  bridge.joinGuard = { list: () => [] }
  bridge.resolveJoin = async () => true
  bridge.safeReply = async () => {}
  bridge.notify = () => {}
  bridge.approvalOffline = () => false
  assert.equal(await bridge.handleJoinAnswer({ userId: 1 }, '1234'), false)
})

test('bridge 核心：撤回无缓存时直接返回', async () => {
  const { bridge } = fakeBridge()
  bridge.config = { allowUsers: [1], allowGroups: [], botQq: 9, adminUsers: [1] }
  bridge.recallCache = { recall: () => null }
  bridge.recallLastAt = new Map()
  bridge.gate = { run: async () => ({ ok: true }) }
  bridge.server = { sendSegments: async () => {} }
  await bridge.handleRecallNotice({ groupId: 0, userId: 1, messageId: 'm1', operatorId: 1, bot: {} })
  assert.equal(bridge.recallLastAt.size, 0)
})

test('bridge 核心：管理员内容过滤直接放行', async () => {
  const { bridge } = fakeBridge()
  bridge.config = {}
  bridge.canRun = () => ({ allowed: true })
  bridge.chatKeyOf = () => 'u:1'
  bridge.routeOf = () => ({ messageType: 'private', targetId: 1 })
  bridge.server = { currentSocket: () => ({ id: 'sock' }) }
  bridge.wordFilter = () => []
  assert.equal(await bridge.handleContentFilter({ messageType: 'private', userId: 1 }, 'hello'), false)
})

test('bridge 核心：notifyAdmin 发送给管理员', async () => {
  const { bridge } = fakeBridge()
  const sent = []
  bridge.config = { adminUsers: [1, 2] }
  bridge.server = {
    currentSocket: () => ({ id: 'sock' }),
    sendSegments: async (...args) => sent.push(args),
  }
  await bridge.notifyAdmin('告警')
  assert.equal(sent.length, 2)
  assert.deepEqual(sent[0][3], [{ type: 'text', data: { text: '告警' } }])
})

test('bridge 核心：backfillRecent 关闭时是 no-op', async () => {
  const { bridge } = fakeBridge()
  await bridge.backfillRecent()
  assert.equal(bridge.sessions, undefined)
})

test('bridge 核心：通知/请求入口转给 inboundRuntime', async () => {
  const { bridge } = fakeBridge()
  const calls = []
  bridge.inboundRuntime = {
    onNotice: (notice) => { calls.push(['notice', notice]) },
    onRequest: (request) => { calls.push(['request', request]) },
  }
  await bridge.onNotice({ noticeType: 'notify' })
  await bridge.onRequest({ requestType: 'friend' })
  assert.deepEqual(calls, [
    ['notice', { noticeType: 'notify' }],
    ['request', { requestType: 'friend' }],
  ])
})

test('bridge 核心：engage / 注入回放写闸门', () => {
  const { bridge } = fakeBridge()
  bridge.config = { engageEnabled: true, injectDryRun: true }
  bridge.engageSwitches = { k: true, off: false }
  assert.equal(bridge.engageOn('k'), true)
  assert.equal(bridge.engageOn('off'), false)
  assert.match(bridge.engageBlockedReason('发送'), /injectDryRun=true/)
  assert.equal(bridge.engageWriteBlocked({ __injected: true }), true)
  assert.equal(bridge.engageWriteBlocked({}), false)
  bridge.config.injectDryRun = false
  assert.equal(bridge.engageWriteBlocked({ __injected: true }), false)
})

test('bridge 核心：markSeen 写 qq-last-seen.json', () => {
  const { bridge } = fakeBridge()
  const dir = mkdtempSync(join(tmpdir(), 'qq-seen-'))
  try {
    bridge.memoryDir = join(dir, 'memory')
    bridge.markSeen('u:7')
    const saved = JSON.parse(readFileSync(join(dir, 'qq-last-seen.json'), 'utf8'))
    assert.equal(typeof saved['u:7'], 'number')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('bridge 核心：writeGate 允许/拒绝文案', () => {
  const { bridge } = fakeBridge()
  bridge.canRun = () => ({ allowed: true })
  assert.equal(bridge.writeGate({}, 'qq.write.send'), '')
  bridge.canRun = () => ({ allowed: false, subject: 'chat:u:1', reason: 'role guest' })
  assert.match(bridge.writeGate({}, 'qq.write.send'), /权限不足.*qq\.write\.send.*role guest/)
})
