import test from 'node:test'
import assert from 'node:assert/strict'
import { tryAutoHeal } from '../lib/services/auto-heal.js'

function harness(overrides = {}) {
  const events = []
  const calls = []
  const deps = {
    config: { autoHealEnabled: true, autoHealCommand: 'start-qq.bat', autoHealCooldownSeconds: 300, autoHealMaxPerHour: 3 },
    trace: { event: (e) => events.push(e) },
    logger: { warn: (m) => calls.push(['warn', m]) },
    spawn: () => ({ unref: () => calls.push(['unref']) }),
    healCommandLabel: () => 'start-qq.bat',
    history: [],
    now: 1_000_000,
    ...overrides,
  }
  return { deps, events, calls }
}

test('未启用直接返回', () => {
  const { deps } = harness({ config: { autoHealEnabled: false } })
  assert.deepEqual(tryAutoHeal(deps), [])
})

test('没配命令只记 warn', () => {
  const { deps, events } = harness({ config: { autoHealEnabled: true, autoHealCommand: '' } })
  tryAutoHeal(deps)
  assert.equal(events[0].level, 'warn')
  assert.match(events[0].reason, /没配 autoHealCommand/)
})

test('冷却期内不拉起', () => {
  const { deps, events } = harness({ history: [1_000_000 - 60_000] })
  assert.deepEqual(tryAutoHeal(deps), [1_000_000 - 60_000])
  assert.match(events[0].reason, /冷却中/)
})

test('每小时上限', () => {
  const { deps, events } = harness({ history: [1, 2, 3], now: 1_000_000, config: { autoHealEnabled: true, autoHealCommand: 'x', autoHealCooldownSeconds: 30, autoHealMaxPerHour: 3 } })
  tryAutoHeal(deps)
  assert.match(events[0].reason, /每小时上限/)
})

test('正常拉起：spawn + unref + trace + log', () => {
  const { deps, events, calls } = harness()
  const at = tryAutoHeal(deps)
  assert.deepEqual(at, [1_000_000])
  assert.equal(calls.some((c) => c[0] === 'unref'), true)
  assert.equal(events[0].ok, true)
  assert.equal(calls.some((c) => c[0] === 'warn'), true)
})

test('spawn 抛错记 error', () => {
  const { deps, events } = harness({ spawn: () => { throw new Error('bad') } })
  tryAutoHeal(deps)
  assert.equal(events[0].level, 'error')
  assert.match(events[0].reason, /自愈启动失败/)
})
