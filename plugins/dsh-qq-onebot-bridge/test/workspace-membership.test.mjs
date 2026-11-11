import test from 'node:test'
import assert from 'node:assert/strict'
import { findWorkspaceEntity, ensureWorkspaceMembership } from '../lib/services/workspace-membership.js'

test('find：resolveByPath 命中', async () => {
  const entity = { id: 'e1' }
  assert.equal(await findWorkspaceEntity({ registry: { resolveByPath: async () => entity }, path: 'D:/a' }), entity)
})

test('find：resolveByPath 失败后 list 命中', async () => {
  const entity = { id: 'e2', path: 'D:/a' }
  const r = await findWorkspaceEntity({
    registry: {
      resolveByPath: async () => { throw new Error('x') },
      list: () => [entity],
    },
    path: 'D:/a',
  })
  assert.equal(r, entity)
})

test('find：两者都没有返回 undefined 并记日志', async () => {
  const logs = []
  const r = await findWorkspaceEntity({ registry: {}, path: 'D:/a', debugLog: (m) => logs.push(m) })
  assert.equal(r, undefined)
  assert.match(logs[0], /workspace lookup failed/)
})

function ensureHarness(overrides = {}) {
  return {
    binding: { path: 'D:/a', title: 'A' },
    sessionId: 'session-abcdef',
    key: 'u:1',
    source: 'bind',
    resolveRegistry: () => ({ resolveByPath: async () => ({ id: 'e1', sessionIds: [], attachSession: async () => {} }) }),
    noteRegistryOnce: () => {},
    trace: { event: () => {} },
    debugLog: () => {},
    ...overrides,
  }
}

test('ensure：无绑定 / registry 未激活 / entity 缺失 / 无 attach', async () => {
  assert.equal(await ensureWorkspaceMembership(ensureHarness({ binding: null })), false)
  assert.equal(await ensureWorkspaceMembership(ensureHarness({ resolveRegistry: () => null })), false)
  assert.equal(await ensureWorkspaceMembership(ensureHarness({
    resolveRegistry: () => ({ resolveByPath: async () => null, list: () => [] }),
  })), false)
  assert.equal(await ensureWorkspaceMembership(ensureHarness({
    resolveRegistry: () => ({ resolveByPath: async () => ({ sessionIds: [] }) }),
  })), false)
})

test('ensure：已登记直接 true；未登记 attach 并 trace', async () => {
  const attached = []
  const events = []
  const already = ensureHarness({
    resolveRegistry: () => ({ resolveByPath: async () => ({ id: 'e', sessionIds: ['session-abcdef'], attachSession: async () => {} }) }),
  })
  assert.equal(await ensureWorkspaceMembership(already), true)

  const r = await ensureWorkspaceMembership(ensureHarness({
    resolveRegistry: () => ({ resolveByPath: async () => ({ id: 'e', sessionIds: [], attachSession: async (id) => attached.push(id) }) }),
    trace: { event: (e) => events.push(e) },
  }))
  assert.equal(r, true)
  assert.deepEqual(attached, ['session-abcdef'])
  assert.equal(events[0].ok, true)
})

test('ensure：attach 抛错返回 false 并 trace warn', async () => {
  const events = []
  const r = await ensureWorkspaceMembership(ensureHarness({
    resolveRegistry: () => ({ resolveByPath: async () => ({ id: 'e', sessionIds: [], attachSession: async () => { throw new Error('boom') } }) }),
    trace: { event: (e) => events.push(e) },
  }))
  assert.equal(r, false)
  assert.equal(events[0].level, 'warn')
})
