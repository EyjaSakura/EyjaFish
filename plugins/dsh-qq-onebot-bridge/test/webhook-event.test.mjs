import test from 'node:test'
import assert from 'node:assert/strict'
import { onWebhookEvent } from '../lib/services/webhook-event.js'

function harness(overrides = {}) {
  const events = []
  const delivered = []
  return {
    events,
    delivered,
    deps: {
      source: { name: 'gh', chat: 'g:1' },
      payload: {},
      config: { allowUsers: [42] },
      renderWebhook: () => ({ ok: true, text: 'hello' }),
      deliverExternal: async (chat, text, stage) => delivered.push([chat, text, stage]),
      trace: { event: (e) => events.push(e) },
      ...overrides,
    },
  }
}

test('渲染失败：warn trace，不投递', async () => {
  const h = harness({ renderWebhook: () => ({ ok: false, reason: 'bad' }) })
  await onWebhookEvent(h.deps)
  assert.equal(h.events[0].ok, false)
  assert.match(h.events[0].reason, /渲染失败/)
  assert.equal(h.delivered.length, 0)
})

test('成功：默认 source.chat + 投递', async () => {
  const h = harness()
  await onWebhookEvent(h.deps)
  assert.equal(h.events[0].ok, true)
  assert.deepEqual(h.delivered[0], ['g:1', 'hello', 'webhook'])
})

test('payload.chat 在白名单内：覆盖窗口', async () => {
  const h = harness({ payload: { chat: 'u:42' } })
  await onWebhookEvent(h.deps)
  assert.equal(h.delivered[0][0], 'u:42')
})

test('payload.chat 不在白名单：保持 source.chat', async () => {
  const h = harness({ payload: { chat: 'u:99' } })
  await onWebhookEvent(h.deps)
  assert.equal(h.delivered[0][0], 'g:1')
})
