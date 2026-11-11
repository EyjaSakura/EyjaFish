import test from 'node:test'
import assert from 'node:assert/strict'
import { applyRolePermission, mountPreset } from '../lib/core/agent-mounting.js'

function logger() {
  const warns = []
  return { warns, warn: (m) => warns.push(m) }
}

test('permission preset 写入成功', () => {
  const calls = []
  applyRolePermission({
    handle: { agent: { session: 's1', id: 'a1' } },
    role: { id: 'owner', permission: 'danger' },
    permissionPresets: { set: (session, name) => calls.push([session, name]) },
    resolveService: () => undefined,
    logger: logger(),
  })
  assert.deepEqual(calls, [['s1', 'danger']])
})

test('permission preset 写入失败只 warn', () => {
  const log = logger()
  applyRolePermission({
    handle: { agent: { session: 's1' } },
    role: { id: 'owner', permission: 'x' },
    permissionPresets: { set: () => { throw new Error('no') } },
    resolveService: () => undefined,
    logger: log,
  })
  assert.equal(log.warns.length, 1)
})

test('guest：approval 优先 setApprovalPolicy', () => {
  const calls = []
  const approval = {
    setApprovalPolicy: (target, policy) => calls.push(['policy', target, policy]),
    setPolicy: () => calls.push(['fallback']),
  }
  applyRolePermission({
    handle: { agent: { session: 's1' } },
    role: { id: 'guest', guest: true },
    permissionPresets: null,
    resolveService: () => approval,
    logger: logger(),
  })
  assert.deepEqual(calls, [['policy', 's1', 'never']])
})

test('guest：没有 setApprovalPolicy 时回退 setPolicy', () => {
  const calls = []
  applyRolePermission({
    handle: { agent: { session: 's1', id: 'a1' } },
    role: { id: 'guest', guest: true },
    permissionPresets: null,
    resolveService: () => ({ setPolicy: (target, policy) => calls.push([target, policy]) }),
    logger: logger(),
  })
  assert.equal(calls[0][1], 'never')
  assert.equal(calls[0][0].id, 'a1')
})

test('mountPreset：空 id 直接返回', async () => {
  let called = false
  await mountPreset({ agentCtx: {}, presetId: '', where: 'x', resolveService: () => { called = true } })
  assert.equal(called, false)
})

test('mountPreset：registry 不可用只 warn', async () => {
  const log = logger()
  await mountPreset({ agentCtx: {}, presetId: 'p', where: 'x', resolveService: () => undefined, logger: log })
  assert.equal(log.warns.length, 1)
})

test('mountPreset：首选失败后回退 standard', async () => {
  const mounted = []
  const registry = {
    mount: async (_ctx, name) => {
      if (name === 'p') throw new Error('no p')
      mounted.push(name)
      return { ok: true }
    },
  }
  await mountPreset({ agentCtx: {}, presetId: 'p', where: 'x', resolveService: () => registry, logger: logger() })
  assert.deepEqual(mounted, ['standard'])
})

test('mountPreset：全失败 warn', async () => {
  const log = logger()
  const registry = { mount: async () => { throw new Error('nope') } }
  await mountPreset({ agentCtx: {}, presetId: 'p', where: 'x', resolveService: () => registry, logger: log })
  assert.equal(log.warns.length, 1)
})
