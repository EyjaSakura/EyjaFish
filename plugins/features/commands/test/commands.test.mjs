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
