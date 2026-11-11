import test from 'node:test'
import assert from 'node:assert/strict'

import { subjectOfChat, subjectOfSender, writeGate } from '../lib/services/acl-runtime.js'
import { actionErrorReason } from '../lib/services/ops-action-runtime.js'
import { createStorageState } from '../lib/services/bridge-storage-setup.js'

test('subjectOfChat：群聊优先 groupId，私聊用 userId', () => {
  assert.equal(subjectOfChat({ messageType: 'group', groupId: 42, userId: 7 }), 'group:42')
  assert.equal(subjectOfChat({ messageType: 'private', userId: 7 }), 'user:7')
})

test('subjectOfChat：出站 route 只有 targetId 也能判', () => {
  assert.equal(subjectOfChat({ messageType: 'group', targetId: 99 }), 'group:99')
  assert.equal(subjectOfChat({ targetId: 99 }), 'user:99')
})

test('subjectOfSender：按发言人', () => {
  assert.equal(subjectOfSender({ userId: 123 }), 'user:123')
  assert.equal(subjectOfSender(null), 'user:')
})

test('writeGate：拒绝时给出可读原因', () => {
  const bridge = { canRun: () => ({ allowed: false, subject: 'user:1', reason: 'no-role' }) }
  const reason = writeGate({ bridge, route: {}, capabilityId: 'qq.write.send' })
  assert.match(reason, /权限不足/)
  assert.match(reason, /qq\.write\.send/)
})

test('writeGate：放行时返回空串', () => {
  const bridge = { canRun: () => ({ allowed: true }) }
  assert.equal(writeGate({ bridge, route: {}, capabilityId: 'qq.write.send' }), '')
})

test('actionErrorReason：1200 / 权限 / 兜底', () => {
  assert.match(actionErrorReason(new Error('set_group_admin failed: get Uid Error'), '设管理'), /uid/)
  assert.match(actionErrorReason(new Error('retcode: 1400'), '设管理'), /管理员/)
  assert.match(actionErrorReason(new Error('boom'), '设管理'), /boom/)
})

test('createStorageState：基本字段齐全', () => {
  const config = { historyArchiveEnabled: false }
  const state = createStorageState({ config })
  for (const key of ['sessionFile', 'sessionStore', 'workspaceFile', 'dshHome', 'sessionRootDir', 'workspaceCache']) {
    assert.ok(state[key] !== undefined, key)
  }
  assert.equal(state.archive, null)
})
