import test from 'node:test'
import assert from 'node:assert/strict'
import { formatHandoffStatus } from '../lib/services/handoff-status.js'

function harness(overrides = {}) {
  return {
    key: 'u:1',
    binding: null,
    entry: null,
    stored: '',
    config: {},
    trace: { recent: () => [] },
    ...overrides,
  }
}

test('未绑定 + 无 live agent', () => {
  const text = formatHandoffStatus(harness())
  assert.match(text, /工作区：未绑定/)
  assert.match(text, /绑定会话：（无）/)
  assert.match(text, /live agent：无/)
  assert.match(text, /最近交接事件：无/)
})

test('工作区绑定 + live agent + 开关', () => {
  const text = formatHandoffStatus(harness({
    binding: { title: '项目A', path: 'D:/a', sessionId: 'session-1234567890' },
    entry: { sessionId: 'live-1234567890', handle: { agent: { status: 'idle' } } },
    config: { claimSessionTransfer: false, preclaimSessions: false, reconcileSessions: false },
  }))
  assert.match(text, /工作区：项目A/)
  assert.match(text, /session-1234/)
  assert.match(text, /live agent：live-1234567（idle）/)
  assert.match(text, /认领迁移=off/)
  assert.match(text, /启动占位=off/)
  assert.match(text, /启动对账=off/)
})

test('绑定会话为空时提示新建', () => {
  const text = formatHandoffStatus(harness({
    binding: { title: 'A', path: 'D:/a', sessionId: '' },
  }))
  assert.match(text, /下一条在该工作区新建/)
})

test('stored 会话兜底', () => {
  const text = formatHandoffStatus(harness({ stored: 'stored-abcdef' }))
  assert.match(text, /stored-abcd/)
})

test('事件按时间排序，最多 6 条', () => {
  const events = [
    { ts: 300, stage: 'bind', ok: true, reason: '三' },
    { ts: 100, stage: 'transfer', ok: false, reason: '一' },
    { ts: 200, stage: 'conflict', ok: true, reason: '二' },
    { ts: 400, stage: 'preclaim', ok: true, reason: '四' },
    { ts: 500, stage: 'reconcile', ok: true, reason: '五' },
    { ts: 600, stage: 'workspace', ok: true, reason: '六' },
    { ts: 700, stage: 'bind', ok: true, reason: '七' },
  ]
  const text = formatHandoffStatus(harness({ trace: { recent: ({ stage }) => events.filter((e) => e.stage === stage) } }))
  assert.match(text, /最近交接事件：/)
  assert.match(text, /七/)
  assert.doesNotMatch(text, /一\]/)
})
