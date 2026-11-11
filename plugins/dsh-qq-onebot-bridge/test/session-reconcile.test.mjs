import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { reconcileSessions } from '../lib/services/session-reconcile.js'

function setup(layout) {
  const root = mkdtempSync(join(tmpdir(), 'reconcile-'))
  const project = join(root, 'proj')
  mkdirSync(project, { recursive: true })
  const headers = {}
  const dirs = []
  for (const [name, header, mtime] of layout) {
    const dir = join(project, name)
    mkdirSync(dir, { recursive: true })
    headers[name] = header
    dirs.push([dir, mtime])
  }
  for (const [dir, mtime] of dirs) if (mtime) utimesSync(dir, mtime, mtime)
  return { root, headers }
}

function harness(headers, overrides = {}) {
  const bound = []
  const deps = {
    enabled: true,
    root: overrides.root,
    readHeaderAt: (dir) => headers[dir.split(/[\\/]/).pop()],
    bindingTargets: () => [['u:1', 's1']],
    syntheticMessage: () => ({ userId: 1 }),
    roleOf: () => ({ guest: false }),
    bindSession: (k, id, src) => bound.push([k, id, src]),
    logger: { info: () => {} },
    trace: { event: () => {} },
    debugLog: () => {},
    ...overrides,
  }
  return { deps, bound }
}

test('沿 parentSession 找到最新子会话', () => {
  const old = new Date(Date.now() - 10_000)
  const { root, headers } = setup([
    ['s1', { id: 's1', parentSession: 'p' }, old],
    ['s2', { id: 's2', parentSession: 's1' }, new Date()],
    ['s3', { id: 's3', parentSession: 's2' }, old],
  ])
  const h = harness(headers, { root })
  reconcileSessions(h.deps)
  assert.deepEqual(h.bound, [['u:1', 's3', 'reconcile']])
})

test('没有子会话时不绑定', () => {
  const { root, headers } = setup([['s1', { id: 's1', parentSession: 'p' }]])
  const h = harness(headers, { root })
  reconcileSessions(h.deps)
  assert.equal(h.bound.length, 0)
})

test('guest / synthetic undefined 跳过', () => {
  const { root, headers } = setup([
    ['s1', { id: 's1', parentSession: 'p' }],
    ['s2', { id: 's2', parentSession: 's1' }],
  ])
  const guest = harness(headers, { root, roleOf: () => ({ guest: true }) })
  reconcileSessions(guest.deps)
  assert.equal(guest.bound.length, 0)

  const none = harness(headers, { root, syntheticMessage: () => undefined })
  reconcileSessions(none.deps)
  assert.equal(none.bound.length, 0)
})

test('关闭 / root 不存在直接返回', () => {
  const off = harness({}, { root: 'Z:/none', enabled: false })
  reconcileSessions(off.deps)
  assert.equal(off.bound.length, 0)

  const missing = harness({}, { root: 'Z:/none' })
  reconcileSessions(missing.deps)
  assert.equal(missing.bound.length, 0)
})

test('循环链不会无限循环', () => {
  const { root, headers } = setup([
    ['s1', { id: 's1', parentSession: 'p' }],
    ['s2', { id: 's2', parentSession: 's1' }],
  ])
  // s1 的父也是 s2，形成环
  headers.s1 = { id: 's1', parentSession: 's2' }
  const h = harness(headers, { root })
  reconcileSessions(h.deps)
  assert.ok(h.bound.length <= 1)
})
