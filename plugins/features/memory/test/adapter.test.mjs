import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createMemoryAdapter } from '../adapter.js'
import { writeStatus } from '../status.js'

function tempStatus(mode = 'shadow') {
  const dir = mkdtempSync(join(tmpdir(), 'qq-memory-status-'))
  const file = join(dir, 'status.json')
  writeStatus({ mode, since: Date.now() }, file)
  return { dir, file }
}

test('memory adapter：off 不加载 core、不注入', async () => {
  const { dir, file } = tempStatus('off')
  try {
    let loads = 0
    const adapter = createMemoryAdapter({
      statusFile: file,
      loadCore: async () => { loads += 1; return {} },
      notify: async () => {},
    })
    const result = await adapter.recall({ bridge: {}, fallbackText: 'OLD' })
    assert.equal(result.mode, 'off')
    assert.equal(result.inject, false)
    assert.equal(result.text, '')
    assert.equal(loads, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('memory adapter：shadow 保留旧文本、不注入', async () => {
  const { dir, file } = tempStatus('shadow')
  try {
    const adapter = createMemoryAdapter({
      statusFile: file,
      loadCore: async () => ({ VERSION: 'stage0' }),
      notify: async () => {},
    })
    const result = await adapter.recall({ bridge: {}, fallbackText: 'OLD' })
    assert.equal(result.mode, 'shadow')
    assert.equal(result.inject, false)
    assert.equal(result.text, 'OLD')
    assert.match(result.source, /shadow/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('memory adapter：core 不可用 → degraded + 通知去重', async () => {
  const { dir, file } = tempStatus('shadow')
  try {
    const notices = []
    const adapter = createMemoryAdapter({
      statusFile: file,
      loadCore: async () => { throw new Error('better-sqlite3 missing') },
      notify: async ({ text }) => { notices.push(text) },
      now: () => Date.parse('2026-11-12T12:00:00+08:00'),
    })
    const first = await adapter.recall({ bridge: {}, fallbackText: 'OLD' })
    const second = await adapter.recall({ bridge: {}, fallbackText: 'OLD' })
    assert.equal(first.mode, 'degraded')
    assert.equal(second.mode, 'degraded')
    assert.equal(notices.length, 1)
    const status = JSON.parse(readFileSync(file, 'utf8'))
    assert.equal(status.mode, 'degraded')
    assert.equal(status.lastNotifiedDate, '2026-11-12')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('memory adapter：degraded 恢复回 shadow 并通知', async () => {
  const { dir, file } = tempStatus('degraded')
  try {
    const notices = []
    const adapter = createMemoryAdapter({
      statusFile: file,
      loadCore: async () => ({ VERSION: 'stage0' }),
      notify: async ({ text }) => { notices.push(text) },
      now: () => Date.parse('2026-11-12T12:00:00+08:00'),
    })
    const result = await adapter.recall({ bridge: {}, fallbackText: 'OLD' })
    assert.equal(result.mode, 'shadow')
    assert.match(notices.join('\n'), /已恢复/)
    const status = JSON.parse(readFileSync(file, 'utf8'))
    assert.equal(status.mode, 'shadow')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('memory adapter：ingest 阶段 0 no-op，不抛', async () => {
  const { dir, file } = tempStatus('shadow')
  try {
    const adapter = createMemoryAdapter({ statusFile: file, loadCore: async () => ({}), notify: async () => {} })
    const result = await adapter.ingest({ windowId: 'w1', turns: [] })
    assert.equal(result.accepted, false)
    assert.equal(result.source, 'stage0-noop')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
