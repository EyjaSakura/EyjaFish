import test from 'node:test'
import assert from 'node:assert/strict'

import { hooks } from '../index.js'

test('events：hooks 暴露私聊文件/视频/群文件/通知', () => {
  assert.deepEqual(Object.keys(hooks).sort(), ['handleGroupFiles', 'handleIncomingVideo', 'handlePrivateFiles', 'onNotice'])
  assert.ok(Object.values(hooks).every((fn) => typeof fn === 'function'))
})
