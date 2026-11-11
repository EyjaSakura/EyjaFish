import test from 'node:test'
import assert from 'node:assert/strict'
import { checkPoke, pickPokeText } from '../lib/services/poke-policy.js'

const config = { allowGroups: [9], allowUsers: [1, 2], botQq: 10001, pokeCooldownSeconds: 15 }

test('群/私聊白名单', () => {
  assert.equal(checkPoke({ notice: { groupId: 8, userId: 1 }, config }).ok, false)
  assert.equal(checkPoke({ notice: { groupId: 9, userId: 3 }, config }).ok, false)
  assert.equal(checkPoke({ notice: { userId: 3 }, config }).ok, false)
})

test('目标不是机器人忽略', () => {
  const r = checkPoke({ notice: { userId: 1, targetId: 42 }, config })
  assert.equal(r.ok, false)
  assert.match(r.reason, /目标不是机器人/)
})

test('冷却窗口', () => {
  const last = new Map([['poke:u:1', 1000]])
  const r = checkPoke({ notice: { userId: 1 }, config, now: 2000, lastPokeAt: last })
  assert.equal(r.ok, false)
  assert.match(r.reason, /冷却中/)
})

test('通过并返回 key', () => {
  const r = checkPoke({ notice: { groupId: 9, userId: 1, targetId: 10001 }, config, now: 100000, lastPokeAt: new Map() })
  assert.equal(r.ok, true)
  assert.equal(r.isGroup, true)
  assert.equal(r.key, 'poke:g:9')
})

test('文案选择', () => {
  assert.equal(pickPokeText({ config: { pokeBackText: ' 你好 ' } }), '你好')
  assert.equal(pickPokeText({ config: {}, pokeBackEnabled: true }), '')
  assert.equal(pickPokeText({ config: { pokeReplies: ['a', 'b'] }, random: () => 0.9 }), 'b')
  assert.match(pickPokeText({ config: {}, random: () => 0 }), /小鲸鱼/)
})
