import test from 'node:test'
import assert from 'node:assert/strict'
import { handlePointsCommand } from '../lib/services/points-command.js'

function harness(text, overrides = {}) {
  const replies = []
  const ledger = { balance: 10, leaderboard: [['a', 3]], transfer: { ok: true, fromBalance: 7 } }
  return {
    replies, ledger,
    deps: {
      message: { userId: 1, senderName: '小明', ats: [2] },
      text,
      routeKey: () => 'g:9',
      safeReply: async (m, t) => replies.push(t),
      pointsStore: {
        balance: () => ledger.balance,
        leaderboard: () => ledger.leaderboard,
        transfer: (...args) => { ledger.lastTransfer = args; return ledger.transfer },
      },
      config: { botQq: 99 },
      formatLeaderboard: (rows) => rows.map(([n, v]) => `${n}:${v}`).join(','),
      ...overrides,
    },
  }
}

test('不匹配返回 false', async () => {
  const h = harness('你好')
  assert.equal(await handlePointsCommand(h.deps), false)
  assert.equal(h.replies.length, 0)
})

test('查积分', async () => {
  const h = harness('/积分')
  assert.equal(await handlePointsCommand(h.deps), true)
  assert.match(h.replies[0], /小明 现在有 10 积分/)
})

test('积分榜', async () => {
  const h = harness('/积分榜')
  assert.equal(await handlePointsCommand(h.deps), true)
  assert.match(h.replies[0], /a:3/)
})

test('转账成功：at 优先、金额取另一个数', async () => {
  const h = harness('/转账 @某人 5')
  assert.equal(await handlePointsCommand(h.deps), true)
  assert.deepEqual(h.ledger.lastTransfer, ['g:9', 1, 2, 5])
  assert.match(h.replies[0], /已转给 2 5 积分（你还剩 7）/)
})

test('缺目标/金额给用法；失败回错误', async () => {
  const miss = harness('/转账')
  assert.equal(await handlePointsCommand(miss.deps), true)
  assert.match(miss.replies[0], /用法/)

  const bad = harness('/转账 @某人 5')
  bad.ledger.transfer = { ok: false, error: '余额不足' }
  assert.equal(await handlePointsCommand(bad.deps), true)
  assert.match(bad.replies[0], /转账失败：余额不足/)
})
