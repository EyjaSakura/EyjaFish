import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { reportWatchdogIncidents } from '../lib/services/watchdog-alert.js'

function harness(overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'wd-'))
  const incidentFile = join(dir, 'incidents.jsonl')
  const stateFile = join(dir, 'state.json')
  writeFileSync(incidentFile, '{"type":"down"}\n')
  const sent = []
  const deps = {
    config: { watchdogAlertEnabled: true },
    server: { currentSocket: () => 'sock' },
    incidentFile,
    stateFile,
    summarize: () => ({ fresh: [1], lastAt: 123, downs: 1, restarts: 2, limited: 0, lines: ['摘要'], alertable: true }),
    bindingTargets: () => [['u:1'], ['u:2'], ['u:3']],
    syntheticMessage: (key) => (key === 'u:3' ? undefined : { key }),
    roleOf: (m) => ({ guest: m.key === 'u:2' }),
    safeReply: async (m, text) => {
      if (m.key === 'u:1') throw new Error('send')
      sent.push([m.key, text])
    },
    trace: { event: () => {} },
    debugLog: () => {},
    now: () => 999,
    ...overrides,
  }
  return { deps, sent, dir, stateFile, incidentFile }
}

test('关闭 / 无连接 / 无事故文件', async () => {
  const off = harness({ config: { watchdogAlertEnabled: false } })
  await reportWatchdogIncidents(off.deps)
  assert.equal(off.sent.length, 0)

  const noSock = harness({ server: { currentSocket: () => null } })
  await reportWatchdogIncidents(noSock.deps)
  assert.equal(noSock.sent.length, 0)

  const missing = harness({ incidentFile: 'Z:/none.jsonl' })
  await reportWatchdogIncidents(missing.deps)
  assert.equal(missing.sent.length, 0)
})

test('无新事故直接返回', async () => {
  const h = harness({ summarize: () => ({ fresh: [] }) })
  await reportWatchdogIncidents(h.deps)
  assert.equal(h.sent.length, 0)
})

test('不可播报只落水位线', async () => {
  const h = harness({ summarize: () => ({ fresh: [1], lastAt: 42, alertable: false }) })
  await reportWatchdogIncidents(h.deps)
  assert.equal(h.sent.length, 0)
  const state = JSON.parse(readFileSync(h.stateFile, 'utf8'))
  assert.equal(state.notifiedAt, 42)
})

test('可播报：跳过 guest/无消息，发送失败不影响其它', async () => {
  let events = 0
  const h = harness({ trace: { event: () => { events += 1 } } })
  await reportWatchdogIncidents(h.deps)
  assert.deepEqual(h.sent, [])
  assert.equal(events, 1)
  assert.equal(JSON.parse(readFileSync(h.stateFile, 'utf8')).notifiedAt, 123)
})
