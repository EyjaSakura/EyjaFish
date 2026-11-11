import test from 'node:test'
import assert from 'node:assert/strict'

import { hooks } from '../index.js'
import { handleHelp } from '../help.js'

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
