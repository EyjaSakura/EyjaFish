import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { backfillWorkspaceMembership } from '../lib/services/workspace-backfill.js'

function setup(names) {
  const root = mkdtempSync(join(tmpdir(), 'backfill-'))
  const project = join(root, 'proj')
  mkdirSync(project, { recursive: true })
  for (const name of names) mkdirSync(join(project, name), { recursive: true })
  return root
}

function harness(overrides = {}) {
  const events = []
  const pending = []
  const deps = {
    workspaceStore: { read: () => ({ 'u:1': { path: 'D:/a', title: 'A' } }) },
    resolveRegistry: () => ({}),
    noteRegistryOnce: () => {},
    findEntity: async () => ({ sessionIds: ['s1'], attachSession: async () => {} }),
    sessionRootDir: setup(['s1', 's2']),
    setPending: (v) => pending.push(v),
    workspaceProjectKey: () => 'proj',
    trace: { event: (e) => events.push(e) },
    debugLog: () => {},
    ...overrides,
  }
  return { deps, events, pending }
}

test('读取失败 / 无绑定直接返回', async () => {
  const bad = harness({ workspaceStore: { read: () => { throw new Error('io') } } })
  await backfillWorkspaceMembership(bad.deps)
  assert.equal(bad.pending.length, 0)

  const empty = harness({ workspaceStore: { read: () => ({}) } })
  await backfillWorkspaceMembership(empty.deps)
  assert.equal(empty.pending.length, 0)
})

test('registry 未激活：标记 pending 并延后', async () => {
  const { deps, pending } = harness({ resolveRegistry: () => undefined })
  await backfillWorkspaceMembership(deps)
  assert.deepEqual(pending, [true])
})

test('entity 缺失 / 无 attachSession / 空目录', async () => {
  const none = harness({ findEntity: async () => null })
  await backfillWorkspaceMembership(none.deps)
  assert.equal(none.pending.length, 0)

  const noAttach = harness({ findEntity: async () => ({ sessionIds: [] }) })
  await backfillWorkspaceMembership(noAttach.deps)
  assert.equal(noAttach.pending.length, 0)

  const emptyDir = harness({ sessionRootDir: setup([]) })
  await backfillWorkspaceMembership(emptyDir.deps)
  assert.equal(emptyDir.pending.length, 0)
})

test('登记新会话并统计 added / failed', async () => {
  const attached = []
  const { deps, events, pending } = harness({
    findEntity: async () => ({
      sessionIds: ['s1'],
      attachSession: async (id) => {
        attached.push(id)
        if (id === 's2') throw new Error('busy')
      },
    }),
  })
  await backfillWorkspaceMembership(deps)
  assert.deepEqual(attached.sort(), ['s1', 's2'])
  assert.deepEqual(pending, [false])
  assert.equal(events.length, 1)
  assert.match(events[0].reason, /新增登记/)
})
