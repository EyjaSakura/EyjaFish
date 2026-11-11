import test from 'node:test'
import assert from 'node:assert/strict'
import { InjectGuard } from '../lib/core/inject-guard.js'

function clock(start = 0) {
  let now = start
  return { now: () => now, advance: (ms) => { now += ms } }
}

test('10 分钟内同文本去重', () => {
  const c = clock()
  const g = new InjectGuard({ now: c.now })
  assert.equal(g.check('message', { userId: 1, text: 'hi' }), '')
  assert.equal(g.check('message', { userId: 1, text: 'hi' }), 'duplicate')
  c.advance(11 * 60_000)
  assert.equal(g.check('message', { userId: 1, text: 'hi' }), '')
})

test('不同会话不算重复', () => {
  const g = new InjectGuard({ now: () => 0 })
  assert.equal(g.check('message', { userId: 1, text: 'hi' }), '')
  assert.equal(g.check('message', { userId: 2, text: 'hi' }), '')
  assert.equal(g.check('message', { groupId: 9, text: 'hi' }), '')
})

test('60 秒内最多 3 条', () => {
  const c = clock()
  const g = new InjectGuard({ now: c.now })
  assert.equal(g.check('message', { userId: 1, text: 'a' }), '')
  assert.equal(g.check('message', { userId: 1, text: 'b' }), '')
  assert.equal(g.check('message', { userId: 1, text: 'c' }), '')
  assert.equal(g.check('message', { userId: 1, text: 'd' }), 'rate-limited')
  c.advance(61_000)
  assert.equal(g.check('message', { userId: 1, text: 'd' }), '')
})

test('空文本既不去重也不限流（保持旧行为）', () => {
  const c = clock()
  const g = new InjectGuard({ now: c.now })
  for (let i = 0; i < 5; i += 1) assert.equal(g.check('notice', {}), '')
})
