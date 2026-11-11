import test from 'node:test'
import assert from 'node:assert/strict'
import { RateLimiter, DuplicateGuard } from '../lib/services/message-guards.js'

function clock(start = 0) {
  let now = start
  return { now: () => now, advance: (ms) => { now += ms } }
}

test('限流：关闭时永不限', () => {
  const r = new RateLimiter({ config: { rateLimitEnabled: false } })
  for (let i = 0; i < 20; i += 1) assert.equal(r.limited('k'), false)
})

test('限流：窗口内超上限拒绝，窗口后恢复', () => {
  const c = clock(1000)
  const r = new RateLimiter({ config: { rateLimitEnabled: true, rateLimitWindowSeconds: 60, rateLimitMaxReplies: 2 }, now: c.now })
  assert.equal(r.limited('k'), false)
  assert.equal(r.limited('k'), false)
  assert.equal(r.limited('k'), true)
  c.advance(61_000)
  assert.equal(r.limited('k'), false)
})

test('去重：关闭 / 合成 id 跳过 / 窗口内重复', () => {
  assert.equal(new DuplicateGuard({ config: {} }).isDuplicate({ messageId: '1' }), false)
  const c = clock(1000)
  const g = new DuplicateGuard({ config: { dedupEnabled: true, dedupWindowSeconds: 300 }, now: c.now })
  assert.equal(g.isDuplicate({ messageId: 'greet-1' }), false)
  assert.equal(g.isDuplicate({ messageId: '1' }), false)
  assert.equal(g.isDuplicate({ messageId: '1' }), true)
  c.advance(301_000)
  assert.equal(g.isDuplicate({ messageId: '1' }), false)
})

test('去重：null id 不拦', () => {
  const g = new DuplicateGuard({ config: { dedupEnabled: true } })
  assert.equal(g.isDuplicate({}), false)
})


test('限流：超过 500 个 key 时清理过期项', () => {
  let now = 0
  const r = new RateLimiter({ config: { rateLimitEnabled: true, rateLimitWindowSeconds: 60, rateLimitMaxReplies: 10 }, now: () => now })
  for (let i = 0; i < 501; i += 1) r.limited('k' + i)
  now = 120_000
  assert.equal(r.limited('fresh'), false)
  assert.equal(r.replyTimes.size <= 501, true)
})
