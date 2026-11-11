import test from 'node:test'
import assert from 'node:assert/strict'
import { isAllowed } from '../lib/services/allow-policy.js'

test('私聊：白名单内允许，否则拒绝', () => {
  const cfg = { allowUsers: [1, 2], allowGroups: [] }
  assert.equal(isAllowed({ messageType: 'private', userId: 1 }, cfg), true)
  assert.equal(isAllowed({ messageType: 'private', userId: 3 }, cfg), false)
})

test('私聊：验证中的申请人允许答题', () => {
  const cfg = { allowUsers: [], allowGroups: [], verifyEnabled: true }
  assert.equal(isAllowed({ messageType: 'private', userId: 9 }, cfg, [9]), true)
  assert.equal(isAllowed({ messageType: 'private', userId: 9 }, { ...cfg, verifyEnabled: false }, [9]), false)
})

test('群聊：群白名单 + 用户白名单', () => {
  const cfg = { allowUsers: [1], allowGroups: [10] }
  assert.equal(isAllowed({ messageType: 'group', groupId: 10, userId: 1 }, cfg), true)
  assert.equal(isAllowed({ messageType: 'group', groupId: 11, userId: 1 }, cfg), false)
  assert.equal(isAllowed({ messageType: 'group', groupId: 10, userId: 2 }, cfg), false)
})

test('群聊：用户白名单为空时不限制用户', () => {
  const cfg = { allowUsers: [], allowGroups: [10] }
  assert.equal(isAllowed({ messageType: 'group', groupId: 10, userId: 2 }, cfg), true)
})
