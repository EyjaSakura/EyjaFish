import test from 'node:test'
import assert from 'node:assert/strict'
import { DeferredInjectQueue } from '../lib/core/deferred-inject-queue.js'

test('队列上限', () => {
  const q = new DeferredInjectQueue({ max: 2 })
  assert.equal(q.push({ kind: 'message', frame: {}, chatKey: 'u:1' }), true)
  assert.equal(q.push({ kind: 'message', frame: {}, chatKey: 'u:1' }), true)
  assert.equal(q.push({ kind: 'message', frame: {}, chatKey: 'u:1' }), false)
  assert.equal(q.size, 2)
})

test('忙的保留，空闲的投递', async () => {
  const q = new DeferredInjectQueue()
  q.push({ kind: 'message', frame: { userId: 1 }, chatKey: 'u:1', at: Date.now() })
  q.push({ kind: 'message', frame: { userId: 2 }, chatKey: 'u:2', at: Date.now() })
  const sent = []
  const r = await q.drain({
    isBusy: (item) => item.frame.userId === 1,
    dispatch: async (item) => sent.push(item.frame.userId),
  })
  assert.deepEqual(sent, [2])
  assert.equal(r.dispatched, 1)
  assert.equal(r.pending, 1)
  assert.equal(q.size, 1)
})

test('超过 TTL 的丢弃', async () => {
  const q = new DeferredInjectQueue({ ttlMs: 1000 })
  q.push({ kind: 'message', frame: {}, chatKey: 'u:1', at: 0 })
  const sent = []
  const r = await q.drain({ now: 5000, dispatch: async (i) => sent.push(i) })
  assert.equal(r.expired, 1)
  assert.equal(sent.length, 0)
  assert.equal(q.size, 0)
})

test('clear 清空', () => {
  const q = new DeferredInjectQueue()
  q.push({ kind: 'message', frame: {}, chatKey: 'u:1' })
  q.clear()
  assert.equal(q.size, 0)
})
