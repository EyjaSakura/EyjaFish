import test from 'node:test'
import assert from 'node:assert/strict'
import { createNotifier } from '../lib/services/notify.js'

function harness(config, opts = {}) {
  const calls = []
  const events = []
  const logs = []
  let now = 0
  const notifier = createNotifier({
    config,
    now: () => now,
    trace: { event: (e) => events.push(e) },
    debugLog: (m) => logs.push(m),
    fetchImpl: async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { status: 200 } },
    ...opts,
  })
  return { notifier, calls, events, logs, advance: (ms) => { now += ms } }
}

test('未开启：不发请求', async () => {
  const { notifier, calls } = harness({ notifyEnabled: false })
  await notifier.send('x')
  assert.equal(calls.length, 0)
})

test('缺配置：只提示一次', async () => {
  const { notifier, calls, events } = harness({ notifyEnabled: true })
  await notifier.send('x')
  await notifier.send('y')
  assert.equal(calls.length, 0)
  assert.equal(events.filter((e) => e.stage === 'notify').length, 1)
})

test('冷却期内只发一次', async () => {
  const { notifier, calls, advance } = harness({ notifyEnabled: true, notifyToken: 't', notifyCooldownSeconds: 30 })
  await notifier.send('a')
  await notifier.send('b')
  assert.equal(calls.length, 1)
  advance(31_000)
  await notifier.send('c')
  assert.equal(calls.length, 2)
})

test('payload 带 token 与标题，默认 URL', async () => {
  const { notifier, calls } = harness({ notifyEnabled: true, notifyToken: 'tok' })
  await notifier.send('hello')
  assert.equal(calls[0].url, 'http://www.pushplus.plus/send')
  assert.deepEqual(calls[0].body, { token: 'tok', title: '小鲸鱼', content: 'hello' })
})

test('失败只记日志', async () => {
  const logs = []
  const notifier = createNotifier({
    config: { notifyEnabled: true, notifyToken: 't' },
    now: () => 0,
    debugLog: (m) => logs.push(m),
    fetchImpl: async () => { throw new Error('net down') },
  })
  await notifier.send('x')
  assert.ok(logs.some((m) => m.includes('notify failed')))
})
