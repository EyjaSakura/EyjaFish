import test from 'node:test'
import assert from 'node:assert/strict'
import { routeKey, routeOf, chatKeyOf } from '../lib/core/routing.js'

test('private 用 u:userId', () => {
  assert.equal(routeKey({ messageType: 'private', userId: 7 }, {}), 'u:7')
})

test('group 默认按人分，chat 模式按群分', () => {
  const msg = { messageType: 'group', groupId: 9, userId: 7 }
  assert.equal(routeKey(msg, {}), 'g:9:u:7')
  assert.equal(routeKey(msg, { sessionMode: 'chat' }), 'g:9')
})

test('routeOf 取对 targetId', () => {
  assert.deepEqual(routeOf({ bot: 'b', messageType: 'private', userId: 7 }), { bot: 'b', messageType: 'private', targetId: 7 })
  assert.deepEqual(routeOf({ bot: 'b', messageType: 'group', groupId: 9, userId: 7 }), { bot: 'b', messageType: 'group', targetId: 9 })
})

test('chatKeyOf 群/私聊', () => {
  assert.equal(chatKeyOf({ messageType: 'group', targetId: 9 }), 'g:9')
  assert.equal(chatKeyOf({ messageType: 'private', targetId: 7 }), 'u:7')
})
