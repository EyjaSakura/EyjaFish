import test from 'node:test'
import assert from 'node:assert/strict'
import { replayHints } from '../lib/services/replay-hints.js'

test('默认值', () => {
  const h = replayHints({})
  assert.equal(h.botQq, 0)
  assert.equal(h.sessionMode, 'chat')
  assert.equal(h.acceptPrivate, true)
  assert.deepEqual(h.allowUsers, [])
})

test('透传配置', () => {
  const h = replayHints({ botQq: 123, allowUsers: ['1'], sessionMode: 'per-user', acceptPrivate: false, filterEnabled: true })
  assert.equal(h.botQq, 123)
  assert.deepEqual(h.allowUsers, ['1'])
  assert.equal(h.sessionMode, 'per-user')
  assert.equal(h.acceptPrivate, false)
  assert.equal(h.filterEnabled, true)
})

test('不包含密钥类字段', () => {
  const h = replayHints({ verifyKeyword: 'secret', webhookSources: [{ token: 'abc' }] })
  const text = JSON.stringify(h)
  assert.equal(text.includes('secret'), false)
  assert.equal(text.includes('abc'), false)
})
