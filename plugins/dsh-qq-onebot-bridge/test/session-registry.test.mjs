import test from 'node:test'
import assert from 'node:assert/strict'
import { SessionRegistry } from '../lib/core/session-registry.js'

test('基本 Map 语义', () => {
  const r = new SessionRegistry()
  const entry = { id: 1 }
  r.set('u:1', entry)
  assert.equal(r.get('u:1'), entry)
  assert.equal(r.size, 1)
  assert.equal(r.has('u:1'), true)
  assert.deepEqual([...r.keys()], ['u:1'])
  assert.equal(r.delete('u:1'), true)
  assert.equal(r.size, 0)
})

test('find / filter', () => {
  const r = new SessionRegistry()
  r.set('u:1', { turnActive: false })
  r.set('u:2', { turnActive: true })
  const found = r.find((e) => e.turnActive)
  assert.equal(found[0], 'u:2')
  assert.equal(r.filter((e) => !e.turnActive).length, 1)
  assert.equal(r.find(() => false), null)
})

test('可迭代', () => {
  const r = new SessionRegistry()
  r.set('a', 1)
  r.set('b', 2)
  assert.deepEqual([...r].map(([k]) => k), ['a', 'b'])
})
