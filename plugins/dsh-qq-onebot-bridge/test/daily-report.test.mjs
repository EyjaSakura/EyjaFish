import test from 'node:test'
import assert from 'node:assert/strict'
import { runDailyReport } from '../lib/services/daily-report.js'

function harness(overrides = {}) {
  const calls = []
  const events = []
  const deps = {
    stopped: false,
    server: { currentSocket: () => 'sock' },
    targets: () => ['g:900000'],
    config: { botQq: 10001, statsEnabled: true },
    trace: { event: (e) => events.push(e) },
    ensureSession: async (m) => { calls.push(['ensure', m.groupId]); return { id: 1 } },
    statsStore: { top: () => [{ name: 'A', count: 3 }] },
    loadMemoryLines: () => ['聊天一', '聊天二'],
    handoff: (entry, message, payload) => calls.push(['handoff', entry.id, message, payload.content[0].text]),
    debugLog: () => {},
    now: () => 1000,
    ...overrides,
  }
  return { deps, calls, events }
}

test('停止 / 无连接直接返回', async () => {
  const stopped = harness({ stopped: true })
  await runDailyReport(stopped.deps)
  assert.equal(stopped.calls.length, 0)

  const off = harness({ server: { currentSocket: () => null } })
  await runDailyReport(off.deps)
  assert.equal(off.events.length, 1)
  assert.match(off.events[0].reason, /没有可用/)
})

test('非法 chatKey 跳过', async () => {
  const { deps, calls } = harness({ targets: () => ['bad'] })
  await runDailyReport(deps)
  assert.equal(calls.length, 0)
})

test('正常日报：prompt 带统计与记录', async () => {
  const { deps, calls } = harness()
  await runDailyReport(deps)
  const handoff = calls.find((c) => c[0] === 'handoff')
  assert.ok(handoff)
  assert.match(handoff[3], /每日群日报/)
  assert.match(handoff[3], /今日发言统计：A 3 条/)
  assert.match(handoff[3], /聊天一/)
})

test('stats 关闭时不带统计', async () => {
  const { deps, calls } = harness({ config: { botQq: 1, statsEnabled: false } })
  await runDailyReport(deps)
  assert.doesNotMatch(calls.find((c) => c[0] === 'handoff')[3], /今日发言统计/)
})

test('单个群失败不影响其它群', async () => {
  let n = 0
  const { deps, calls } = harness({
    targets: () => ['g:900000', 'g:900001'],
    ensureSession: async (m) => {
      n += 1
      if (n === 1) throw new Error('boom')
      return { id: 2 }
    },
  })
  await runDailyReport(deps)
  assert.equal(calls.filter((c) => c[0] === 'handoff').length, 1)
})
