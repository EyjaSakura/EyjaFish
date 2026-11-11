import test from 'node:test'
import assert from 'node:assert/strict'
import { handleBroadcastCommand } from '../lib/services/broadcast-command.js'

function harness(overrides = {}) {
  const replies = []
  const calls = []
  const deps = {
    message: {},
    text: '/播报',
    config: { adminEnabled: true },
    canRun: () => ({ allowed: true }),
    broadcast: {
      list: () => [
        { id: 'b1', enabled: true, describe: '每日播报', nextAt: 1760000000000, lastReason: 'ok' },
        { id: 'b2', enabled: false, describe: '周报', nextAt: 0 },
      ],
      runOnce: async (id) => { calls.push(['run', id]); return overrides.runResult ?? { ok: true, reason: '已发送' } },
    },
    webhook: {
      status: () => ({ port: 8080, listening: true, sources: [{ name: 'ci', received: 3, dropped: 1 }] }),
    },
    safeReply: async (_m, t) => replies.push(t),
    ...overrides,
  }
  return { deps, replies, calls }
}

test('非命令 / 无权限', async () => {
  assert.equal(await handleBroadcastCommand(harness({ text: '你好' }).deps), false)

  const denied = harness({ canRun: () => ({ allowed: false }) })
  assert.equal(await handleBroadcastCommand(denied.deps), true)
  assert.match(denied.replies[0], /仅管理员/)
})

test('未启用播报与 webhook', async () => {
  const { deps, replies } = harness({ broadcast: null, webhook: null })
  await handleBroadcastCommand(deps)
  assert.match(replies[0], /定时播报未启用/)
  assert.match(replies[0], /webhook 未启用/)
})

test('列表 + 手动触发成功/失败 + 用法', async () => {
  const ok = harness({ text: '/播报 测试 b1' })
  await handleBroadcastCommand(ok.deps)
  assert.match(ok.replies[0], /已触发 b1/)
  assert.deepEqual(ok.calls, [['run', 'b1']])

  const bad = harness({ text: '/播报 测试 b1', runResult: { ok: false, reason: '失败' } })
  await handleBroadcastCommand(bad.deps)
  assert.match(bad.replies[0], /触发 b1 失败/)

  const usage = harness({ text: '/播报 随便' })
  await handleBroadcastCommand(usage.deps)
  assert.match(usage.replies[0], /用法/)
})

test('webhook 状态与来源', async () => {
  const { deps, replies } = harness()
  await handleBroadcastCommand(deps)
  assert.match(replies[0], /监听中/)
  assert.match(replies[0], /ci：收到 3｜丢弃 1/)
})
