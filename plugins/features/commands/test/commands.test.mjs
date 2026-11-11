import test from 'node:test'
import assert from 'node:assert/strict'

import { hooks } from '../index.js'
import { handleHelp } from '../help.js'
import { handleAdminCommand } from '../admin.js'
import { handleOpsCommand } from '../ops.js'
import { handleEngageCommand } from '../engage.js'

test('commands：hooks 暴露六个命令/工具入口', () => {
  assert.deepEqual(Object.keys(hooks).sort(), [
    'handleAdminCommand', 'handleEngageCommand', 'handleHelp', 'handleOpsCommand',
    'registerReminderTools', 'registerWorklogTools',
  ])
  assert.ok(Object.values(hooks).every((fn) => typeof fn === 'function'))
})

test('commands：/help 对 owner 追加管理/工作区段', async () => {
  const seen = []
  const bridge = {
    config: {
      adminEnabled: true, imageGenEnabled: false, sttEnabled: false,
      voiceReadingEnabled: false, checkinEnabled: false, fortuneEnabled: false,
      diceEnabled: false, pointsEnabled: false, gameEnabled: false,
      statsEnabled: false, groupReadEnabled: false, memberQueryEnabled: false,
      groupFileEnabled: false, albumEnabled: false, ocrEnabled: false,
      historySearchEnabled: false, mcStatusEnabled: false,
    },
    isAdmin: () => true,
    canSwitchWorkspace: () => true,
    engageOn: () => false,
    safeReply: async (_m, text) => seen.push(text),
  }
  await handleHelp({ message: { messageType: 'group', userId: 1 }, bridge })
  assert.match(seen[0], /小鲸鱼使用指南/)
  assert.match(seen[0], /工作区/)
  assert.match(seen[0], /管理：\/mute/)
})

test('commands：/help 在所有功能开启时展开完整菜单', async () => {
  const seen = []
  const bridge = {
    config: {
      adminEnabled: true, imageGenEnabled: true, sttEnabled: true,
      voiceReadingEnabled: true, checkinEnabled: true, fortuneEnabled: true,
      diceEnabled: true, pointsEnabled: true, gameEnabled: true,
      statsEnabled: true, groupReadEnabled: true, memberQueryEnabled: true,
      groupFileEnabled: true, albumEnabled: true, ocrEnabled: true,
      historySearchEnabled: true, mcStatusEnabled: true, dailyReportEnabled: true,
      keywordEnabled: true, antiRecallEnabled: true, filterEnabled: true,
      verifyEnabled: true, opsReportEnabled: true, requestSyncEnabled: true,
    },
    isAdmin: () => true,
    canSwitchWorkspace: () => true,
    engageOn: () => false,
    safeReply: async (_m, text) => seen.push(text),
  }
  await handleHelp({ message: { messageType: 'group', userId: 1 }, bridge })
  assert.match(seen[0], /生图/)
  assert.match(seen[0], /语音转文字/)
  assert.match(seen[0], /日报/)
  assert.match(seen[0], /防撤回/)
  assert.match(seen[0], /入群审批/)
})

test('commands：/help 对 guest 不显示管理/工作区段', async () => {
  const seen = []
  const bridge = {
    config: {
      adminEnabled: true, imageGenEnabled: false, sttEnabled: false,
      voiceReadingEnabled: false, checkinEnabled: false, fortuneEnabled: false,
      diceEnabled: false, pointsEnabled: false, gameEnabled: false,
      statsEnabled: false, groupReadEnabled: false, memberQueryEnabled: false,
      groupFileEnabled: false, albumEnabled: false, ocrEnabled: false,
      historySearchEnabled: false, mcStatusEnabled: false,
    },
    isAdmin: () => false,
    canSwitchWorkspace: () => false,
    engageOn: () => false,
    safeReply: async (_m, text) => seen.push(text),
  }
  await handleHelp({ message: { messageType: 'group', userId: 2 }, bridge })
  assert.doesNotMatch(seen[0], /管理：\/mute/)
  assert.doesNotMatch(seen[0], /工作区/)
})

test('commands：群管命令在私聊直接拒绝', async () => {
  const replies = []
  const bridge = { safeReply: async (_m, text) => replies.push(text) }
  await handleAdminCommand({
    message: { messageType: 'private', userId: 1 },
    cmd: 'mute', arg: '', bridge,
  })
  assert.match(replies[0], /仅支持群聊/)
})

test('commands：/全员禁言 被 gate 拒绝时报告失败', async () => {
  const replies = []
  const bridge = {
    config: {},
    server: { currentSocket: () => ({ id: 'sock' }), setGroupWholeBan: async () => {} },
    botAdminBlockedReason: () => '',
    routeKey: () => 'g:1',
    gate: { run: async () => ({ ok: false, reason: 'no permission' }) },
    safeReply: async (_m, text) => replies.push(text),
  }
  await handleAdminCommand({
    message: { messageType: 'group', groupId: 1, userId: 1 },
    cmd: '全员禁言', arg: '', bridge,
  })
  assert.match(replies[0], /操作失败：no permission/)
})

test('commands：/全员禁言 成功走 gate + setGroupWholeBan', async () => {
  const calls = []
  const bridge = {
    config: {},
    server: {
      currentSocket: () => ({ id: 'sock' }),
      setGroupWholeBan: async (_s, groupId, enable) => calls.push(['ban', groupId, enable]),
    },
    botAdminBlockedReason: () => '',
    routeKey: () => 'g:1',
    gate: { run: async (_action, _key, _desc, fn) => { await fn(); return { ok: true } } },
    safeReply: async (_m, text) => calls.push(['reply', text]),
  }
  await handleAdminCommand({
    message: { messageType: 'group', groupId: 1, userId: 1 },
    cmd: '全员禁言', arg: '', bridge,
  })
  assert.deepEqual(calls[0], ['ban', 1, true])
  assert.match(calls[1][1], /已开启全员禁言/)
})

test('commands：/解除全员禁言 成功调用 setGroupWholeBan(false)', async () => {
  const calls = []
  const bridge = {
    config: {},
    server: {
      currentSocket: () => ({ id: 'sock' }),
      setGroupWholeBan: async (_s, groupId, enable) => calls.push(['ban', groupId, enable]),
    },
    botAdminBlockedReason: () => '',
    routeKey: () => 'g:1',
    gate: { run: async (_a, _k, _d, fn) => { await fn(); return { ok: true } } },
    safeReply: async (_m, text) => calls.push(['reply', text]),
  }
  await handleAdminCommand({
    message: { messageType: 'group', groupId: 1, userId: 1 },
    cmd: '解除全员禁言', arg: '', bridge,
  })
  assert.deepEqual(calls[0], ['ban', 1, false])
  assert.match(calls[1][1], /已解除全员禁言/)
})

test('commands：/kick 先进入二次确认，不直接踢人', async () => {
  const replies = []
  const pendingKicks = new Map()
  const bridge = {
    config: { botQq: 9 },
    server: { currentSocket: () => ({ id: 'sock' }) },
    botAdminBlockedReason: () => '',
    routeKey: () => 'g:1',
    pendingKicks,
    safeReply: async (_m, text) => replies.push(text),
  }
  await handleAdminCommand({
    message: { messageType: 'group', groupId: 1, userId: 1 },
    cmd: 'kick', arg: '12345', bridge, debugLog: () => {},
  })
  assert.equal(pendingKicks.get('g:1').userId, 12345)
  assert.match(replies[0], /确认将 12345 移出本群/)
})

test('commands：/unmute 成功调用 setGroupBan(0)', async () => {
  const calls = []
  const bridge = {
    config: { botQq: 9 },
    server: {
      currentSocket: () => ({ id: 'sock' }),
      setGroupBan: async (_s, groupId, target, seconds) => calls.push(['ban', groupId, target, seconds]),
    },
    botAdminBlockedReason: () => '',
    routeKey: () => 'g:1',
    gate: { run: async (_a, _k, _d, fn) => { await fn(); return { ok: true } } },
    safeReply: async (_m, text) => calls.push(['reply', text]),
  }
  await handleAdminCommand({
    message: { messageType: 'group', groupId: 1, userId: 1 },
    cmd: 'unmute', arg: '12345', bridge, debugLog: () => {},
  })
  assert.deepEqual(calls[0], ['ban', 1, 12345, 0])
  assert.match(calls[1][1], /已解除 12345 的禁言/)
})

test('commands：/mute 成功调用 setGroupBan', async () => {
  const calls = []
  const bridge = {
    config: { botQq: 9 },
    server: {
      currentSocket: () => ({ id: 'sock' }),
      setGroupBan: async (_s, groupId, target, seconds) => calls.push(['ban', groupId, target, seconds]),
    },
    botAdminBlockedReason: () => '',
    routeKey: () => 'g:1',
    gate: { run: async (_a, _k, _d, fn) => { await fn(); return { ok: true } } },
    safeReply: async (_m, text) => calls.push(['reply', text]),
  }
  await handleAdminCommand({
    message: { messageType: 'group', groupId: 1, userId: 1 },
    cmd: 'mute', arg: '12345 5', bridge, debugLog: () => {},
  })
  assert.deepEqual(calls[0], ['ban', 1, 12345, 300])
  assert.match(calls[1][1], /已禁言 12345 5 分钟/)
})

test('commands：/名片 成功调用 setGroupCard', async () => {
  const calls = []
  const bridge = {
    config: { botQq: 9 },
    server: {
      currentSocket: () => ({ id: 'sock' }),
      setGroupCard: async (_s, groupId, target, value) => calls.push(['card', groupId, target, value]),
    },
    botAdminBlockedReason: () => '',
    routeKey: () => 'g:1',
    gate: { run: async (_a, _k, _d, fn) => { await fn(); return { ok: true } } },
    safeReply: async (_m, text) => calls.push(['reply', text]),
  }
  await handleAdminCommand({
    message: { messageType: 'group', groupId: 1, userId: 1, ats: [2] },
    cmd: '名片', arg: '新名字', bridge,
  })
  assert.deepEqual(calls[0], ['card', 1, 2, '新名字'])
  assert.match(calls[1][1], /已更新 2 的群名片/)
})

test('commands：/名片 缺 @ 目标时给用法', async () => {
  const replies = []
  const bridge = {
    config: {},
    server: { currentSocket: () => ({ id: 'sock' }) },
    botAdminBlockedReason: () => '',
    routeKey: () => 'g:1',
    safeReply: async (_m, text) => replies.push(text),
  }
  await handleAdminCommand({
    message: { messageType: 'group', groupId: 1, userId: 1, ats: [] },
    cmd: '名片', arg: '新名字', bridge,
  })
  assert.match(replies[0], /用法：\/名片 @某人/)
})

test('commands：/公告 无 OneBot 连接时明确拒绝', async () => {
  const replies = []
  const bridge = {
    config: {},
    server: { currentSocket: () => null },
    botAdminBlockedReason: () => '',
    routeKey: () => 'g:1',
    safeReply: async (_m, text) => replies.push(text),
  }
  await handleAdminCommand({
    message: { messageType: 'group', groupId: 1, userId: 1 },
    cmd: '公告', arg: 'hello', bridge,
  })
  assert.match(replies[0], /当前无可用连接/)
})

test('commands：/取消精华 对引用消息成功调用 deleteEssenceMsg', async () => {
  const calls = []
  const bridge = {
    config: {},
    server: {
      currentSocket: () => ({ id: 'sock' }),
      deleteEssenceMsg: async (_s, messageId) => calls.push(['delete', messageId]),
    },
    botAdminBlockedReason: () => '',
    routeKey: () => 'g:1',
    gate: { run: async (_a, _k, _d, fn) => { await fn(); return { ok: true } } },
    safeReply: async (_m, text) => calls.push(['reply', text]),
  }
  await handleAdminCommand({
    message: { messageType: 'group', groupId: 1, userId: 1, reply: { messageId: 'm1' } },
    cmd: '取消精华', arg: '', bridge,
  })
  assert.deepEqual(calls[0], ['delete', 'm1'])
  assert.match(calls[1][1], /已取消精华/)
})

test('commands：/精华 对引用消息成功调用 setEssenceMsg', async () => {
  const calls = []
  const bridge = {
    config: {},
    server: {
      currentSocket: () => ({ id: 'sock' }),
      setEssenceMsg: async (_s, messageId) => calls.push(['essence', messageId]),
    },
    botAdminBlockedReason: () => '',
    routeKey: () => 'g:1',
    gate: { run: async (_a, _k, _d, fn) => { await fn(); return { ok: true } } },
    safeReply: async (_m, text) => calls.push(['reply', text]),
  }
  await handleAdminCommand({
    message: { messageType: 'group', groupId: 1, userId: 1, reply: { messageId: 'm1' } },
    cmd: '精华', arg: '', bridge,
  })
  assert.deepEqual(calls[0], ['essence', 'm1'])
  assert.match(calls[1][1], /已设为精华/)
})

test('commands：/公告 gate 拒绝时报告失败', async () => {
  const replies = []
  const bridge = {
    config: {},
    server: { currentSocket: () => ({ id: 'sock' }), sendGroupNotice: async () => {} },
    botAdminBlockedReason: () => '',
    routeKey: () => 'g:1',
    gate: { run: async () => ({ ok: false, reason: 'denied' }) },
    safeReply: async (_m, text) => replies.push(text),
  }
  await handleAdminCommand({
    message: { messageType: 'group', groupId: 1, userId: 1 },
    cmd: '公告', arg: 'hello', bridge,
  })
  assert.match(replies[0], /发布失败：denied/)
})

test('commands：/公告 成功走 gate + sendGroupNotice', async () => {
  const calls = []
  const bridge = {
    config: {},
    server: {
      currentSocket: () => ({ id: 'sock' }),
      sendGroupNotice: async (_s, groupId, text) => calls.push(['notice', groupId, text]),
    },
    botAdminBlockedReason: () => '',
    routeKey: () => 'g:1',
    gate: { run: async (_action, _key, _desc, fn) => { await fn(); return { ok: true } } },
    safeReply: async (_m, text) => calls.push(['reply', text]),
  }
  await handleAdminCommand({
    message: { messageType: 'group', groupId: 1, userId: 1 },
    cmd: '公告', arg: 'hello', bridge,
  })
  assert.deepEqual(calls[0], ['notice', 1, 'hello'])
  assert.match(calls[1][1], /群公告已发布/)
})

test('commands：/公告 缺内容 / /精华 缺引用时给用法', async () => {
  const replies = []
  const bridge = {
    config: {},
    server: { currentSocket: () => ({ id: 'sock' }) },
    botAdminBlockedReason: () => '',
    routeKey: () => 'g:1',
    safeReply: async (_m, text) => replies.push(text),
  }
  await handleAdminCommand({
    message: { messageType: 'group', groupId: 1, userId: 1 },
    cmd: '公告', arg: '', bridge,
  })
  await handleAdminCommand({
    message: { messageType: 'group', groupId: 1, userId: 1, reply: null },
    cmd: '精华', arg: '', bridge,
  })
  assert.match(replies[0], /用法：\/公告/)
  assert.match(replies[1], /引用一条消息/)
})

test('commands：/退群 默认关闭时说明原因', async () => {
  const replies = []
  const bridge = {
    config: { leaveGroupEnabled: false },
    server: { currentSocket: () => ({ id: 'sock' }) },
    botAdminBlockedReason: () => '',
    routeKey: () => 'g:1',
    safeReply: async (_m, text) => replies.push(text),
  }
  await handleAdminCommand({
    message: { messageType: 'group', groupId: 1, userId: 1 },
    cmd: '退群', arg: '', bridge,
  })
  assert.match(replies[0], /退群功能默认关闭/)
})

test('commands：/clear 会 rotate + 清记忆并回复', async () => {
  const calls = []
  const bridge = {
    routeKey: () => 'u:1',
    rotate: async (message) => calls.push(['rotate', message.userId]),
    clearMemory: (key) => calls.push(['clear', key]),
    safeReply: async (_m, text) => calls.push(['reply', text]),
  }
  await handleAdminCommand({
    message: { messageType: 'private', userId: 1 },
    cmd: 'clear', arg: '', bridge,
  })
  assert.deepEqual(calls[0], ['rotate', 1])
  assert.deepEqual(calls[1], ['clear', 'u:1'])
  assert.match(calls[2][1], /已清空/)
})

test('commands：非 ops 文本不处理，群运营关闭时明确回复', async () => {
  const replies = []
  const bridge = {
    config: { groupOpsEnabled: false },
    safeReply: async (_m, text) => replies.push(text),
    trace: { event: () => {} },
  }
  assert.equal(await handleOpsCommand({ message: { messageType: 'group' }, text: 'hello', bridge }), false)
  assert.equal(await handleOpsCommand({ message: { messageType: 'group' }, text: '/群打卡', bridge }), true)
  assert.match(replies[0], /群运营工具箱未启用/)
})

test('commands：非互动命令忽略，赞榜未启用时说明原因', async () => {
  const replies = []
  const bridge = {
    config: { engageEnabled: false, reactionStatsEnabled: false },
    engageOn: () => false,
    safeReply: async (_m, text) => replies.push(text),
    trace: { event: () => {} },
  }
  assert.equal(await handleEngageCommand({ message: { messageType: 'group', groupId: 1 }, text: 'hello', bridge }), false)
  assert.equal(await handleEngageCommand({ message: { messageType: 'group', groupId: 1 }, text: '/赞榜', bridge }), true)
  assert.match(replies[0], /表情统计未启用/)
})
