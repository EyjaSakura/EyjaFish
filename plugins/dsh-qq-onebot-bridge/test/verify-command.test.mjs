import test from 'node:test'
import assert from 'node:assert/strict'
import { handleVerifyCommand } from '../lib/services/verify-command.js'

function harness(overrides = {}) {
  const replies = []
  const calls = []
  const entries = overrides.entries ?? [
    { id: 1, userId: 5, approveOnly: false },
    { id: 2, userId: 6, approveOnly: true },
  ]
  const deps = {
    message: {},
    cmd: { action: 'approve', target: '1' },
    joinGuard: {
      list: () => entries,
      find: (id) => entries.find((e) => String(e.id) === String(id)) ?? null,
    },
    resolveJoin: async (entry, approve) => {
      calls.push(['resolve', entry.id, approve])
      return overrides.resolveOk?.(entry) !== false
    },
    safeReply: async (_m, t) => replies.push(t),
    trace: { event: () => {} },
    approvalOffline: () => overrides.offline === true,
    formatPendingList: () => '待审列表',
    ...overrides,
  }
  return { deps, replies, calls, entries }
}

test('/待审 纯本地读', async () => {
  const { deps, replies, calls } = harness({ cmd: { action: 'list', target: '' } })
  await handleVerifyCommand(deps)
  assert.equal(replies[0], '待审列表')
  assert.equal(calls.length, 0)
})

test('离线回合不审批', async () => {
  const { deps, replies } = harness({ offline: true })
  await handleVerifyCommand(deps)
  assert.match(replies[0], /不真的审批/)
})

test('缺目标给用法；all 空队列', async () => {
  const none = harness({ cmd: { action: 'approve', target: '' } })
  await handleVerifyCommand(none.deps)
  assert.match(none.replies[0], /用法/)

  const empty = harness({ cmd: { action: 'approve', target: 'all' }, entries: [] })
  await handleVerifyCommand(empty.deps)
  assert.match(empty.replies[0], /暂无待处理/)
})

test('all：逐条处理并说明失败原因', async () => {
  const { deps, replies, calls } = harness({
    cmd: { action: 'reject', target: 'all' },
    resolveOk: (entry) => entry.id !== 2,
  })
  await handleVerifyCommand(deps)
  assert.equal(calls.length, 2)
  assert.match(replies[0], /已处理 1\/2/)
  assert.match(replies[0], /只能同意/)
})

test('单条：找不到 / 批准 / 拒绝失败', async () => {
  const miss = harness({ cmd: { action: 'approve', target: '99' } })
  await handleVerifyCommand(miss.deps)
  assert.match(miss.replies[0], /没有 #99/)

  const ok = harness({ cmd: { action: 'approve', target: '1' } })
  await handleVerifyCommand(ok.deps)
  assert.match(ok.replies[0], /已批准/)

  const bad = harness({
    cmd: { action: 'reject', target: '2' },
    resolveOk: () => false,
  })
  await handleVerifyCommand(bad.deps)
  assert.match(bad.replies[0], /只能同意/)
})
