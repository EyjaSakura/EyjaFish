import test from 'node:test'
import assert from 'node:assert/strict'
import { handoff } from '../lib/core/handoff.js'

const createUserMessage = (payload) => ({ role: 'user', ...payload })

function entry() {
  return { pendingTurns: [], lastTraceId: 't1', key: 'u:1', handle: { agent: { followup: async (msg) => msg } } }
}

test('handoff：普通消息记账并交给 agent', async () => {
  const e = entry()
  const msg = await handoff({ entry: e, message: { text: 'hi' }, payload: { content: 'hi' }, trace: { event: () => {} }, createUserMessage })
  assert.equal(e.pendingTurns.length, 1)
  assert.equal(e.pendingTurns[0].injected, false)
  assert.equal(msg.content, 'hi')
})

test('handoff：注入回合记 injected 并留 trace', async () => {
  const events = []
  const e = entry()
  await handoff({ entry: e, message: { __injected: true }, payload: { content: 'x' }, trace: { event: (ev) => events.push(ev) }, createUserMessage })
  assert.equal(e.pendingTurns[0].injected, true)
  assert.ok(events.some((ev) => ev.stage === 'inject' && ev.ok === true))
})

test('handoff：超过 32 条截断并 warn', async () => {
  const events = []
  const e = entry()
  e.pendingTurns = Array.from({ length: 32 }, () => ({ injected: false, at: 0 }))
  await handoff({ entry: e, message: {}, payload: { content: 'x' }, trace: { event: (ev) => events.push(ev) }, createUserMessage })
  assert.equal(e.pendingTurns.length, 32)
  assert.ok(events.some((ev) => ev.level === 'warn' && ev.reason.includes('积压')))
})

test('fake-agent 回合：followup 产生回复', async () => {
  const replies = []
  const e = entry()
  e.handle.agent.followup = async (msg) => {
    replies.push('模型回复：' + msg.content)
    return { text: replies[0] }
  }
  await handoff({ entry: e, message: { text: '你好' }, payload: { content: '你好' }, trace: { event: () => {} }, createUserMessage })
  assert.deepEqual(replies, ['模型回复：你好'])
})
