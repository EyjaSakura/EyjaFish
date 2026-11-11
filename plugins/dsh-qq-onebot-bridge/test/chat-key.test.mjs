import test from 'node:test'
import assert from 'node:assert/strict'
import { syntheticMessageForKey } from '../lib/core/chat-key.js'

test('u: 私聊', () => {
  const m = syntheticMessageForKey('u:123', 'sock')
  assert.equal(m.messageType, 'private')
  assert.equal(m.userId, 123)
  assert.equal(m.bot, 'sock')
})

test('g: 群聊带用户', () => {
  const m = syntheticMessageForKey('g:9:u:5')
  assert.equal(m.messageType, 'group')
  assert.equal(m.groupId, 9)
  assert.equal(m.userId, 5)
  assert.equal(m.bot, false)
})

test('g: 群聊 chat 模式无用户', () => {
  const m = syntheticMessageForKey('g:9')
  assert.equal(m.groupId, 9)
  assert.equal(m.userId, 0)
})

test('非法 key 返回 undefined', () => {
  assert.equal(syntheticMessageForKey('x:1'), undefined)
  assert.equal(syntheticMessageForKey('u:'), undefined)
  assert.equal(syntheticMessageForKey(''), undefined)
})
