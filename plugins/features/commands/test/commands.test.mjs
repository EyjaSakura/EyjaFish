import test from 'node:test'
import assert from 'node:assert/strict'

import { hooks } from '../index.js'

test('commands：hooks 暴露六个命令/工具入口', () => {
  assert.deepEqual(Object.keys(hooks).sort(), [
    'handleAdminCommand', 'handleEngageCommand', 'handleHelp', 'handleOpsCommand',
    'registerReminderTools', 'registerWorklogTools',
  ])
  assert.ok(Object.values(hooks).every((fn) => typeof fn === 'function'))
})
