import test from 'node:test'
import assert from 'node:assert/strict'
import { collectRuntimeSnapshot } from '../lib/services/runtime-snapshot-state.js'

function bridge() {
  return {
    sessions: new Map([['u:1', { key: 'u:1', sessionId: 's1', lastTraceId: 't1', lastTurnAt: 5, handle: { agent: { status: 'idle' } } }]]),
    reminders: new Set(['r']),
    votes: new Set(['v']),
    games: new Set(['g']),
    botOnline: true,
    botOnlineAt: 10,
    botAdminKnown: new Map([[9, true]]),
    botAdminKnownAt: new Map([[9, 20]]),
    joinGuard: { size: 2 },
    inbox: { summary: () => ({ total: 3 }) },
    archive: { size: 4 },
    config: { historyArchiveKeepDays: 90, injectEnabled: true, injectDryRun: false },
    injectFile: 'f',
    injectInterval: 1000,
    injectConsumed: 2,
    injectLastAt: 30,
    broadcast: null,
    webhook: null,
    autoHealAt: [],
    gate: {},
    trace: {},
    pluginVersion: '0.8.0',
  }
}

test('收集快照：会话/计数/管理员/注入', () => {
  const snap = collectRuntimeSnapshot({
    bridge: bridge(),
    featureFlags: () => ({ a: true }),
    replayHints: () => ({ b: 1 }),
    botAdminTtlMs: 600000,
    countLines: () => 7,
    now: 1000,
    pid: 42,
    uptimeSeconds: 9,
  })
  assert.equal(snap.now, 1000)
  assert.equal(snap.pid, 42)
  assert.equal(snap.version, '0.8.0')
  assert.equal(snap.sessions[0].chatKey, 'u:1')
  assert.deepEqual(snap.counts, { reminders: 1, votes: 1, games: 1 })
  assert.deepEqual(snap.botAdmin, [{ groupId: 9, admin: true, at: 20 }])
  assert.equal(snap.botAdminTtlMs, 600000)
  assert.equal(snap.inject.queued, 7)
  assert.deepEqual(snap.features, { a: true })
})

test('inject 缺省值', () => {
  const b = bridge()
  b.config = { historyArchiveKeepDays: 30 }
  b.injectInterval = undefined
  b.injectConsumed = undefined
  b.injectLastAt = undefined
  const snap = collectRuntimeSnapshot({ bridge: b, featureFlags: () => ({}), replayHints: () => ({}), now: 1 })
  assert.equal(snap.inject.enabled, false)
  assert.equal(snap.inject.intervalMs, 0)
  assert.equal(snap.inject.queued, 0)
})
