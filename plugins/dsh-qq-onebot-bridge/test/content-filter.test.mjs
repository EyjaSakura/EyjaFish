import test from 'node:test'
import assert from 'node:assert/strict'
import { handleContentFilter } from '../lib/services/content-filter.js'

function harness(overrides = {}) {
  const replies = []
  const calls = []
  const deps = {
    message: { messageType: 'group', groupId: 9, userId: 1, senderName: 'A', messageId: 'm' },
    text: '正常内容',
    config: { floodEnabled: false, filterEnabled: false },
    canRun: () => ({ allowed: false }),
    chatKey: 'g:9',
    groupId: 9,
    socket: 'sock',
    floodGuard: { observe: () => ({ action: 'none' }) },
    gate: {
      run: async (action, key, desc, fn) => {
        calls.push(['gate', action])
        if (overrides.gateBlocked) return { ok: false, reason: '拒绝' }
        await fn()
        return { ok: true }
      },
    },
    server: {
      setGroupBan: async (...a) => calls.push(['ban', ...a]),
      deleteMsg: async (...a) => calls.push(['delete', ...a]),
    },
    safeReply: async (_m, t) => replies.push(t),
    wordFilter: { check: () => ({ hit: false }) },
    debugLog: () => {},
    ...overrides,
  }
  return { deps, replies, calls }
}

test('管理员豁免', async () => {
  const { deps } = harness({ canRun: () => ({ allowed: true }) })
  assert.equal(await handleContentFilter(deps), false)
})

test('刷屏：禁言 / 警告', async () => {
  const mute = harness({
    config: { floodEnabled: true },
    floodGuard: { observe: () => ({ action: 'mute', muteSeconds: 120 }) },
  })
  assert.equal(await handleContentFilter(mute.deps), true)
  assert.equal(mute.calls.some((c) => c[0] === 'ban'), true)
  assert.match(mute.replies[0], /冷静 2 分钟/)

  const warn = harness({
    config: { floodEnabled: true, floodStrikeLimit: 3 },
    floodGuard: { observe: () => ({ action: 'warn', strike: 1 }) },
  })
  assert.equal(await handleContentFilter(warn.deps), true)
  assert.match(warn.replies[0], /慢一点/)
})

test('敏感词：未命中 / 未启用返回 false', async () => {
  const off = harness({ config: { filterEnabled: false } })
  assert.equal(await handleContentFilter(off.deps), false)

  const miss = harness({ config: { filterEnabled: true }, wordFilter: { check: () => ({ hit: false }) } })
  assert.equal(await handleContentFilter(miss.deps), false)
})

test('敏感词：撤回 / 禁言 / 警告', async () => {
  const recall = harness({
    config: { filterEnabled: true, filterAction: 'recall' },
    wordFilter: { check: () => ({ hit: true, word: 'bad' }) },
  })
  assert.equal(await handleContentFilter(recall.deps), true)
  assert.equal(recall.calls.some((c) => c[0] === 'delete'), true)
  assert.match(recall.replies[0], /已撤回/)

  const mute = harness({
    config: { filterEnabled: true, filterAction: 'mute', filterMuteSeconds: 300 },
    wordFilter: { check: () => ({ hit: true, word: 'bad' }) },
  })
  assert.match((await handleContentFilter(mute.deps), mute.replies[0]), /禁言 5 分钟/)

  const warn = harness({
    config: { filterEnabled: true, filterAction: 'warn' },
    wordFilter: { check: () => ({ hit: true, word: 'bad' }) },
  })
  assert.match((await handleContentFilter(warn.deps), warn.replies[0]), /请注意群规/)
})

test('闸门拒绝时不回复但返回已处理', async () => {
  const { deps, replies } = harness({
    config: { filterEnabled: true, filterAction: 'recall' },
    wordFilter: { check: () => ({ hit: true, word: 'bad' }) },
    gateBlocked: true,
  })
  assert.equal(await handleContentFilter(deps), true)
  assert.equal(replies.length, 0)
})
