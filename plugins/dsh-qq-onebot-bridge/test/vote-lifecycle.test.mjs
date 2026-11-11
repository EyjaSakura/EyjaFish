import test from 'node:test'
import assert from 'node:assert/strict'
import { showVote, endVote, publishVote, maybeVote } from '../lib/services/vote-lifecycle.js'

function vote() {
  return { question: '吃', options: [{ key: 'A', label: '面' }, { key: 'B', label: '饭' }], votes: new Map([[1, 'A']]), route: { messageType: 'group', targetId: 9 }, timer: 5 }
}

test('showVote：无投票 / 有投票', async () => {
  const replies = []
  const votes = new Map()
  await showVote({ message: {}, routeKey: () => 'k', votes, safeReply: async (m, t) => replies.push(t) })
  assert.match(replies[0], /没有进行中的投票/)

  votes.set('k', vote())
  await showVote({ message: {}, routeKey: () => 'k', votes, safeReply: async (m, t) => replies.push(t) })
  assert.match(replies[1], /A 面：1 票/)
})

test('endVote：无投票 / 清定时器并公布', async () => {
  const replies = []
  const published = []
  const timers = new Set([5])
  const votes = new Map()
  await endVote({ message: {}, routeKey: () => 'k', votes, timers, publishVote: async () => {}, safeReply: async (m, t) => replies.push(t) })
  assert.match(replies[0], /没有进行中的投票/)

  votes.set('k', vote())
  await endVote({
    message: {}, routeKey: () => 'k', votes, timers,
    clearTimer: (t) => timers.delete(t),
    publishVote: async (v) => published.push(v),
    safeReply: async () => {},
  })
  assert.equal(votes.has('k'), false)
  assert.equal(timers.has(5), false)
  assert.equal(published.length, 1)
})

test('publishVote：无 socket 记 trace', async () => {
  const events = []
  await publishVote({
    vote: vote(),
    injectedTaskBlocked: () => false,
    chatKeyOf: () => 'g:9',
    server: { currentSocket: () => null },
    trace: { event: (e) => events.push(e) },
  })
  assert.equal(events[0].stage, 'vote')
})

test('publishVote：注入任务被拦不公布', async () => {
  let sent = 0
  await publishVote({
    vote: { ...vote(), injected: true },
    injectedTaskBlocked: () => true,
    chatKeyOf: () => 'g:9',
    server: { currentSocket: () => ({}), sendSegments: async () => { sent += 1 } },
  })
  assert.equal(sent, 0)
})

test('publishVote：正常发送', async () => {
  let sent
  await publishVote({
    vote: vote(),
    injectedTaskBlocked: () => false,
    chatKeyOf: () => 'g:9',
    server: {
      currentSocket: () => ({}),
      sendSegments: async (s, type, id, segs) => { sent = [type, id, segs[0].data.text] },
    },
  })
  assert.equal(sent[0], 'group')
  assert.equal(sent[1], 9)
  assert.match(sent[2], /投票结束/)
})

test('maybeVote：非群 / 无投票 / 不匹配 / 命中', () => {
  assert.equal(maybeVote({ message: { messageType: 'private' }, routeKey: () => 'k', votes: new Map() }), false)
  const votes = new Map([['k', vote()]])
  assert.equal(maybeVote({ message: { messageType: 'group', text: 'a', userId: 7 }, routeKey: () => 'k', votes }), true)
  assert.equal(votes.get('k').votes.get(7), 'A')
})
