import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRuntimeSnapshot } from '../lib/services/runtime-snapshot.js'

const base = {
  now: 1_000_000,
  pid: 42,
  version: '1.0.0',
  uptimeSeconds: 100,
  sessions: [{ chatKey: 'u:1', sessionId: 's1' }],
  counts: { reminders: 2, votes: 1, games: 3 },
  botOnline: true,
  botOnlineAt: 999_000,
  botAdmin: [{ groupId: 9, admin: true, at: 999_000 }],
  botAdminTtlMs: 10_000,
  joinsPending: 0,
  gate: { snapshot: () => ({ open: true }) },
  trace: { summary: () => ({ n: 1 }), listTraces: () => [{ id: 't' }] },
  config: { webhookPort: 8899 },
}

test('基础字段与默认值', () => {
  const s = buildRuntimeSnapshot(base)
  assert.equal(s.updatedAt, 1_000_000)
  assert.equal(s.sessionCount, 1)
  assert.equal(s.reminders, 2)
  assert.equal(s.archive.enabled, false)
  assert.equal(s.archive.keepDays, 90)
  assert.equal(s.injection.enabled, false)
  assert.equal(s.injection.dryRun, true)
  assert.deepEqual(s.jobs.broadcast, [])
  assert.equal(s.jobs.webhook.enabled, false)
  assert.equal(s.gate.open, true)
  assert.deepEqual(s.recentTraces, [{ id: 't' }])
})

test('botAdmin stale 计算', () => {
  const s = buildRuntimeSnapshot({
    ...base,
    now: 2_000_000,
    botAdmin: [
      { groupId: '9', admin: true, at: 2_000_000 - 1000 },
      { groupId: '10', admin: false, at: 0 },
    ],
    botAdminTtlMs: 5000,
  })
  assert.equal(s.botAdmin[0].stale, false)
  assert.equal(s.botAdmin[1].stale, true)
  assert.equal(s.botAdmin[0].groupId, '9')
})

test('broadcast / webhook / autoHeal', () => {
  const s = buildRuntimeSnapshot({
    ...base,
    now: 3_600_000,
    broadcast: { list: () => [{ id: 'b1', kind: 'daily', enabled: true, runs: 2 }] },
    webhook: { status: () => ({ sources: [{ name: 's', received: 1, dropped: 0, lastAt: 5 }] }) },
    config: { webhookPort: 8899, autoHealEnabled: true, autoHealCommand: 'x', autoHealCooldownSeconds: 60, autoHealMaxPerHour: 5 },
    autoHealAt: [3_600_000 - 1000, 3_600_000 - 2 * 3_600_000],
  })
  assert.equal(s.jobs.broadcast[0].id, 'b1')
  assert.equal(s.jobs.webhook.sources[0].name, 's')
  assert.equal(s.jobs.autoHeal.enabled, true)
  assert.equal(s.jobs.autoHeal.commandConfigured, true)
  assert.equal(s.jobs.autoHeal.attemptsLastHour, 1)
})

test('archive / injection 透传', () => {
  const s = buildRuntimeSnapshot({
    ...base,
    archive: { dir: 'D:/arc' },
    keepDays: 30,
    inject: { enabled: true, file: 'f', dryRun: false, intervalMs: 1, consumed: 2, lastAt: 3, queued: 4 },
  })
  assert.equal(s.archive.enabled, true)
  assert.equal(s.archive.dir, 'D:/arc')
  assert.equal(s.archive.keepDays, 30)
  assert.equal(s.injection.file, 'f')
  assert.equal(s.injection.queued, 4)
})
