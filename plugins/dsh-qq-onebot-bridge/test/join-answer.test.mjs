import test from 'node:test'
import assert from 'node:assert/strict'
import { handleJoinAnswer } from '../lib/services/join-answer.js'

function harness(overrides = {}) {
  const replies = []
  const notes = []
  const calls = []
  const deps = {
    message: { userId: 5 },
    text: '12',
    joinGuard: {
      list: () => [{ id: 1, userId: 5, question: '1+1', answer: '2', adopted: false }],
    },
    checkVerifyAnswer: (entry, text) => String(text) === entry.answer,
    resolveJoin: async (entry, approve, opts) => { calls.push(['resolve', entry.id, approve, opts]); return overrides.resolveOk !== false },
    safeReply: async (_m, t) => replies.push(t),
    notify: async (t) => notes.push(t),
    approvalOffline: () => overrides.offline === true,
    debugLog: () => {},
    ...overrides,
  }
  return { deps, replies, notes, calls }
}

test('没有匹配的 pending 返回 false', async () => {
  const { deps } = harness({ joinGuard: { list: () => [] } })
  assert.equal(await handleJoinAnswer(deps), false)
})

test('答案错误：短数字提醒，长文本不打扰', async () => {
  const wrong = harness({ text: '3' })
  assert.equal(await handleJoinAnswer(wrong.deps), true)
  assert.match(wrong.replies[0], /答案不对/)

  const long = harness({ text: '这是一段普通聊天' })
  assert.equal(await handleJoinAnswer(long.deps), true)
  assert.equal(long.replies.length, 0)
})

test('答案正确：放行 + 通知', async () => {
  const { deps, replies, notes, calls } = harness({ text: '2' })
  assert.equal(await handleJoinAnswer(deps), true)
  assert.match(replies[0], /验证通过/)
  assert.match(notes[0], /答对验证题/)
  assert.equal(calls[0][1], 1)
  assert.equal(calls[0][2], true)
})

test('离线/写操作失败：不回复放行', async () => {
  const { deps, replies, calls } = harness({ text: '2', resolveOk: false })
  assert.equal(await handleJoinAnswer(deps), true)
  assert.equal(replies.length, 0)
  assert.equal(calls.length, 1)
})
