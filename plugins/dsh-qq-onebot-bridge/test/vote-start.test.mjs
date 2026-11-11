import test from 'node:test'
import assert from 'node:assert/strict'
import { startVote } from '../lib/services/vote-start.js'

function harness(overrides = {}) {
  const replies = []
  const published = []
  let timerFn
  const votes = new Map()
  const timers = new Set()
  return {
    replies, published, votes, timers,
    fire: () => timerFn(),
    deps: {
      message: { messageType: 'group', groupId: 9 },
      vc: { question: '吃什么', options: [{ key: 'A', label: '面' }, { key: 'B', label: '饭' }] },
      config: { voteDurationSeconds: 60 },
      votes,
      timers,
      routeKey: () => 'g:9',
      safeReply: async (m, text) => replies.push(text),
      publishVote: (v) => published.push(v),
      setTimeoutImpl: (fn) => { timerFn = fn; return 123 },
      ...overrides,
    },
  }
}

test('非群聊拒绝', async () => {
  const h = harness({ message: { messageType: 'private' } })
  await startVote(h.deps)
  assert.match(h.replies[0], /仅支持群聊/)
})

test('已有投票拒绝', async () => {
  const h = harness()
  h.votes.set('g:9', {})
  await startVote(h.deps)
  assert.match(h.replies[0], /已有进行中的投票/)
  assert.equal(h.votes.size, 1)
})

test('成功建投票 + 定时器 + 提示', async () => {
  const h = harness()
  await startVote(h.deps)
  assert.equal(h.votes.size, 1)
  assert.equal(h.timers.has(123), true)
  assert.match(h.replies[0], /投票开始（1 分钟后截止）/)
  assert.match(h.replies[0], /A：面/)
})

test('注入帧标记 injected；到点删除并发布', async () => {
  const h = harness({ message: { messageType: 'group', groupId: 9, __injected: true } })
  await startVote(h.deps)
  const vote = h.votes.get('g:9')
  assert.equal(vote.injected, true)
  h.fire()
  assert.equal(h.votes.has('g:9'), false)
  assert.equal(h.published.length, 1)
})
