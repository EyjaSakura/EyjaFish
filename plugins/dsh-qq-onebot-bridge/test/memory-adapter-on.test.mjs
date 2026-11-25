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
