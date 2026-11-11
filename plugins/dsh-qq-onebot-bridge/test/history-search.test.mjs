import test from 'node:test'
import assert from 'node:assert/strict'
import { handleHistorySearch } from '../lib/services/history-search.js'
import { formatHistoryLines } from '../lib/history.js'

function harness(overrides = {}) {
  const replies = []
  const deps = {
    message: {},
    text: '/找 火锅',
    config: { historySearchEnabled: true, historySearchDays: 7, historySearchLimit: 20, botQq: 10001 },
    canRun: () => ({ allowed: true }),
    archive: { search: () => ({ hits: [{ userId: 1, name: 'A', ts: 1760000000000, text: '火锅好吃' }], scanned: 10 }) },
    chatKey: 'g:9',
    safeReply: async (_m, t) => replies.push(t),
    formatHistoryLines,
    ...overrides,
  }
  return { deps, replies }
}

test('关闭 / 无权限 / 非命令返回 false', async () => {
  assert.equal(await handleHistorySearch(harness({ config: { historySearchEnabled: false } }).deps), false)
  assert.equal(await handleHistorySearch(harness({ canRun: () => ({ allowed: false }) }).deps), false)
  assert.equal(await handleHistorySearch(harness({ text: '你好' }).deps), false)
})

test('空关键词 / 无归档', async () => {
  const empty = harness({ text: '/找' })
  assert.equal(await handleHistorySearch(empty.deps), true)
  assert.match(empty.replies[0], /用法/)

  const noArchive = harness({ archive: null })
  assert.equal(await handleHistorySearch(noArchive.deps), true)
  assert.match(noArchive.replies[0], /归档未开启/)
})

test('检索异常', async () => {
  const { deps, replies } = harness({ archive: { search: () => { throw new Error('boom') } } })
  assert.equal(await handleHistorySearch(deps), true)
  assert.match(replies[0], /检索失败/)
})

test('无命中提示扫描数', async () => {
  const { deps, replies } = harness({ archive: { search: () => ({ hits: [], scanned: 42 }) } })
  assert.equal(await handleHistorySearch(deps), true)
  assert.match(replies[0], /42/)
})

test('有命中：格式化 + 截断提示', async () => {
  const { deps, replies } = harness({
    archive: { search: () => ({ hits: [{ userId: 1, name: 'A', ts: 1760000000000, text: '火锅好吃' }], scanned: 10, truncated: true }) },
  })
  assert.equal(await handleHistorySearch(deps), true)
  assert.match(replies[0], /火锅好吃/)
  assert.match(replies[0], /命中更多/)
})
