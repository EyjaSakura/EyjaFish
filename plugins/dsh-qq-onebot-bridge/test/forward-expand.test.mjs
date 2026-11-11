import test from 'node:test'
import assert from 'node:assert/strict'
import { expandForwards } from '../lib/services/forward-expand.js'

const base = { maxNodes: 10, maxChars: 100 }

test('provided：优先使用并提供截断', async () => {
  const r = await expandForwards({ ...base, message: { forwardText: 'x'.repeat(120) }, getForwardMsg: async () => ({}), currentSocket: () => null })
  assert.equal(r.source, 'provided')
  assert.equal(r.truncated, true)
  assert.match(r.text, /内容过长已截断/)
})

test('offline 且没有 forwardText：不访问 QQ', async () => {
  const r = await expandForwards({ ...base, message: { __injected: true, forwards: [{ id: '1' }] }, getForwardMsg: async () => { throw new Error('should not call') }, currentSocket: () => null })
  assert.equal(r.source, 'offline')
  assert.match(r.reason, /回放\/注入/)
})

test('没有卡片 id', async () => {
  const r = await expandForwards({ ...base, message: {}, getForwardMsg: async () => ({}), currentSocket: () => null })
  assert.equal(r.source, 'none')
  assert.match(r.reason, /没有 id/)
})

test('获取失败：reason 带失败次数', async () => {
  const r = await expandForwards({ ...base, message: { forwards: [{ id: '1' }] }, getForwardMsg: async () => { throw new Error('boom') }, currentSocket: () => null, debugLog: () => {} })
  assert.equal(r.source, 'empty')
  assert.match(r.reason, /获取失败（1 次调用出错）/)
})

test('成功展开：source=api', async () => {
  const payload = { messages: [{ sender: { nickname: 'A' }, content: [{ type: 'text', data: { text: 'hi' } }] }] }
  const r = await expandForwards({ ...base, message: { forwards: [{ id: '1' }] }, getForwardMsg: async () => payload, currentSocket: () => null })
  assert.equal(r.source, 'api')
  assert.match(r.text, /hi/)
})
