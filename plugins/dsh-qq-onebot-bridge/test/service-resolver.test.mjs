import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveServiceMode } from '../lib/core/service-resolver.js'

test('无 ctx', () => {
  assert.deepEqual(resolveServiceMode({ ctx: null, name: 'x' }), { service: undefined, via: 'no-ctx' })
})

test('reflect strict 命中', () => {
  const r = resolveServiceMode({ ctx: { reflect: { get: (name, strict) => (name === 'x' && strict ? 'svc' : undefined) } }, name: 'x' })
  assert.equal(r.service, 'svc')
  assert.match(r.via, /strict=true/)
})

test('strict 未命中时取非 strict', () => {
  const calls = []
  const r = resolveServiceMode({
    ctx: { reflect: { get: (name, strict) => { calls.push(strict); return strict ? undefined : 'any' } } },
    name: 'x',
  })
  assert.equal(r.service, 'any')
  assert.match(r.via, /strict=false/)
  assert.deepEqual(calls, [true, false])
})

test('activeOnly 跳过非 strict', () => {
  const r = resolveServiceMode({
    ctx: { reflect: { get: () => undefined }, x: undefined },
    name: 'x',
    activeOnly: true,
  })
  assert.deepEqual(r, { service: undefined, via: 'none' })
})

test('reflect 抛错后属性兜底', () => {
  const r = resolveServiceMode({
    ctx: { reflect: { get: () => { throw new Error('no inject') } }, x: 'prop' },
    name: 'x',
  })
  assert.equal(r.service, 'prop')
  assert.equal(r.via, 'ctx[name]')
})

test('属性访问抛错返回 none', () => {
  const ctx = { reflect: { get: () => undefined } }
  Object.defineProperty(ctx, 'x', { get() { throw new Error('cannot get') } })
  assert.deepEqual(resolveServiceMode({ ctx, name: 'x' }), { service: undefined, via: 'none' })
})
