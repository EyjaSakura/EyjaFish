import test from 'node:test'
import assert from 'node:assert/strict'
import { handleInjection } from '../lib/core/inject-handler.js'
import { DeferredInjectQueue } from '../lib/core/deferred-inject-queue.js'

function makeHost(overrides = {}) {
  const state = {
    dryRunCalls: [],
    windows: [],
    injected: [],
    events: [],
    injecting: [],
    snapshots: 0,
  }
  const host = {
    server: {
      currentSocket: () => 'sock',
      setDryRun: (enabled, scope) => { state.dryRunCalls.push({ enabled, scope }); return { enabled: true, scope } },
      takeDryRunCalls: () => [],
    },
    config: { injectDryRun: true },
    sessions: new Map(),
    routeKey: (m) => `u:${m.userId}`,
    deferredQueue: new DeferredInjectQueue(),
    trace: { event: (e) => state.events.push(e) },
    guard: () => '',
    gate: { dryRun: false },
    beginWindow: (k) => state.windows.push(['begin', k]),
    endWindow: (k) => state.windows.push(['end', k]),
    onQqMessage: async (m) => state.injected.push(m),
    onNotice: async () => {},
    onRequest: async () => {},
    setInjecting: (v) => state.injecting.push(v),
    writeSnapshot: () => { state.snapshots += 1 },
    summarizeSegments: () => '',
    ...overrides,
  }
  return { host, state }
}

test('会话忙时入队，不派发', async () => {
  const { host, state } = makeHost()
  host.sessions.set('u:1', { turnActive: true })
  await handleInjection({ kind: 'message', frame: { userId: 1, text: 'hi' }, host })
  assert.equal(host.deferredQueue.size, 1)
  assert.equal(state.injected.length, 0)
})

test('guard 拦截时不派发', async () => {
  const { host, state } = makeHost({ guard: () => 'duplicate' })
  await handleInjection({ kind: 'message', frame: { userId: 1, text: 'hi' }, host })
  assert.equal(state.injected.length, 0)
  assert.ok(state.events.some((e) => String(e.reason).includes('去重')))
})

test('dry-run：开/关作用域、派发 __injected、写快照', async () => {
  const { host, state } = makeHost()
  host.sessions.set('u:1', { turnActive: false })
  await handleInjection({ kind: 'message', frame: { userId: 1, text: 'hi' }, host })

  assert.equal(state.dryRunCalls.length, 2)
  assert.equal(state.dryRunCalls[0].enabled, true)
  assert.equal(state.dryRunCalls[1].enabled, true)
  assert.equal(state.injected.length, 1)
  assert.equal(state.injected[0].__injected, true)
  assert.equal(state.windows[0][0], 'begin')
  assert.equal(state.windows[1][0], 'end')
  assert.equal(host.gate.dryRun, false)
  assert.deepEqual(state.injecting, [true, false])
  assert.equal(state.snapshots, 1)
})

test('非 dry-run 不触碰 setDryRun', async () => {
  const { host, state } = makeHost({ config: { injectDryRun: false } })
  await handleInjection({ kind: 'notice', frame: { userId: 1 }, host })
  assert.equal(state.dryRunCalls.length, 0)
  assert.equal(state.injecting.length, 2)
})


test('队列满时丢弃并记 warn', async () => {
  const { host, state } = makeHost({ deferredQueue: new DeferredInjectQueue({ max: 1 }) })
  host.sessions.set('u:1', { turnActive: true })
  await handleInjection({ kind: 'message', frame: { userId: 1, text: 'a' }, host })
  await handleInjection({ kind: 'message', frame: { userId: 1, text: 'b' }, host })
  assert.equal(host.deferredQueue.size, 1)
  assert.ok(state.events.some((e) => String(e.reason).includes('已满')))
})


test('dry-run：记录被拦下的出站调用', async () => {
  const calls = []
  const { host, state } = makeHost({
    server: {
      currentSocket: () => 'sock',
      setDryRun: () => ({ enabled: true, scope: null }),
      takeDryRunCalls: () => [{ action: 'send_private_msg', params: { message: [{ type: 'text', data: { text: 'hi' } }] } }],
    },
    summarizeSegments: (segs) => segs.map((s) => s.data.text).join(''),
  })
  await handleInjection({ kind: 'message', frame: { userId: 1, text: 'x' }, host })
  const done = state.events.find((e) => String(e.reason).includes('注入完成'))
  assert.equal(done.data.wouldSend.length, 1)
  assert.equal(done.data.wouldSend[0].text, 'hi')
  assert.equal(done.data.wouldSend[0].action, 'send_private_msg')
})
