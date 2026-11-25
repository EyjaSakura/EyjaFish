import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createMemoryAdapter } from '../../features/memory/adapter.js'
import * as core from '../../memory-core/index.mjs'

test('adapter：on 模式只对 owner 注入，非 owner 保留 fallback', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'memory-adapter-'))
  const dbFile = join(dir, 'memory.db')
  const statusFile = join(dir, 'status.json')
  const db = core.openStore(dbFile)
  core.addNode(db, { id: 'on-1', type: 'event', subject: 'u:123', description: '端口 6700 配置', owner_confirmed: 1 })
  db.close()
  let adapter = null
  try {
    const fakeCore = {
      ...core,
      DEFAULT_DB: dbFile,
      openStore: () => core.openStore(dbFile),
    }
    adapter = createMemoryAdapter({
      statusFile,
      env: { MEMORY_MODE: 'on' },
      loadCore: async () => fakeCore,
      notify: async () => {},
    })
    const bridge = { ownerQQ: () => '123' }
    const owner = await adapter.recall({ bridge, key: 'u:123', fallbackText: 'OLD', message: { text: '端口 6700' } })
    assert.equal(owner.mode, 'on')
    assert.equal(owner.inject, true)
    assert.match(owner.text, /^【记忆】/)
    assert.notEqual(owner.text, 'OLD')
    const guest = await adapter.recall({ bridge, key: 'u:999', fallbackText: 'OLD', message: { text: '端口 6700' } })
    assert.equal(guest.inject, false)
    assert.equal(guest.text, 'OLD')
  } finally {
    adapter?.close?.()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('adapter：off 回滚与 degraded fallback', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'memory-adapter-'))
  const statusFile = join(dir, 'status.json')
  let adapter = null
  let broken = null
  try {
    adapter = createMemoryAdapter({
      statusFile,
      env: { MEMORY_MODE: 'on' },
      loadCore: async () => ({ ...core, openStore: () => core.openStore(':memory:') }),
      notify: async () => {},
    })
    adapter.setMode('off')
    const off = await adapter.recall({ bridge: { ownerQQ: () => '123' }, key: 'u:123', fallbackText: 'OLD', message: { text: '端口' } })
    assert.equal(off.mode, 'off')
    assert.equal(off.inject, false)
    assert.equal(off.text, '')

    broken = createMemoryAdapter({
      statusFile: join(dir, 'broken-status.json'),
      env: { MEMORY_MODE: 'shadow' },
      loadCore: async () => { throw new Error('core unavailable') },
      notify: async () => {},
    })
    const degraded = await broken.recall({ bridge: { ownerQQ: () => '123' }, key: 'u:123', fallbackText: 'OLD', message: { text: '端口' } })
    assert.equal(degraded.mode, 'degraded')
    assert.equal(degraded.inject, false)
    assert.equal(degraded.text, 'OLD')
  } finally {
    adapter?.close?.()
    broken?.close?.()
    rmSync(dir, { recursive: true, force: true })
  }
})
