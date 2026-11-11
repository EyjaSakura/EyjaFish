import test from 'node:test'
import assert from 'node:assert/strict'
import { InjectWindowRegistry } from '../lib/core/inject-window.js'

function clock(start = 0) {
  let now = start
  return { now: () => now, advance: (ms) => { now += ms } }
}

test('begin → active，end → 失效', () => {
  const c = clock(1000)
  const r = new InjectWindowRegistry({ now: c.now })
  assert.equal(r.active('u:1'), false)
  r.begin('u:1')
  assert.equal(r.active('u:1'), true)
  r.end('u:1')
  assert.equal(r.active('u:1'), false)
})

test('60 秒后自动过期', () => {
  const c = clock(0)
  const r = new InjectWindowRegistry({ now: c.now })
  r.begin('u:1')
  c.advance(59_000)
  assert.equal(r.active('u:1'), true)
  c.advance(2_000)
  assert.equal(r.active('u:1'), false)
})

test('空 key 不报错', () => {
  const r = new InjectWindowRegistry()
  r.begin('')
  r.end('')
  assert.equal(r.active(''), false)
  assert.equal(r.active(undefined), false)
})
