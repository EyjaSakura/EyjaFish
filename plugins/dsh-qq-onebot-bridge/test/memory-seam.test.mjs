import test from 'node:test'
import assert from 'node:assert/strict'

import { callMemoryRecall, callMemoryIngest } from '../lib/services/memory-seam.js'

test('memory-seam：recall 返回插件结果', async () => {
  const bridge = { dispatchFeature: async (name, ctx) => ({ name, mode: 'shadow', text: ctx.fallbackText, inject: false }) }
  const result = await callMemoryRecall({ bridge, context: { fallbackText: 'OLD' } })
  assert.equal(result.mode, 'shadow')
  assert.equal(result.text, 'OLD')
})

test('memory-seam：recall 超时返回 null，不阻塞', async () => {
  const bridge = { dispatchFeature: () => new Promise(() => {}) }
  const started = Date.now()
  const result = await callMemoryRecall({ bridge, context: {}, timeoutMs: 30 })
  assert.equal(result, null)
  assert.ok(Date.now() - started < 500)
})

test('memory-seam：ingest 不抛、不阻塞调用者', () => {
  const bridge = { dispatchFeature: () => { throw new Error('boom') } }
  assert.doesNotThrow(() => callMemoryIngest({ bridge, context: {} }))
})
