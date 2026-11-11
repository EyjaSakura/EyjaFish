import test from 'node:test'
import assert from 'node:assert/strict'
import { onRequest } from '../lib/request-events.js'

function makeBridge(overrides = {}) {
  const calls = []
  const marks = []
  const bridge = {
    stopped: false,
    config: {
      recordInbound: false,
      allowUsers: ['1'],
      allowGroups: [9],
      verifyEnabled: true,
      verifyKeyword: '芝麻开门',
    },
    inbox: { record: () => {} },
    gate: { run: async (_action, _key, _desc, fn) => { calls.push(['gate']); await fn(); return { ok: true } } },
    server: { action: async (_bot, action, params) => { calls.push(['action', action, params.approve]) } },
    joinGuard: { addRequest: (r) => { calls.push(['enqueue', r.userId]); return { id: 1, entry: { ...r } } } },
    beginEventTrace: () => ({ mark: (stage, info) => marks.push({ stage, ...info }) }),
    identityBegin: (uid) => calls.push(['identityBegin', uid]),
    identityAll: () => ({}),
    identitySave: () => calls.push(['identitySave']),
    replyTo: async () => calls.push(['reply']),
    resolveJoin: async () => true,
    approvalOffline: () => false,
    notify: async (t) => calls.push(['notify', t]),
    notifyAdmin: async (t) => calls.push(['notifyAdmin', t]),
    writeRuntimeSnapshot: () => calls.push(['snapshot']),
    ...overrides,
  }
  return { bridge, calls, marks }
}

test('friend：白名单内自动同意并问候', async () => {
  const { bridge, calls } = makeBridge()
  await onRequest({ request: { requestType: 'friend', userId: 1, flag: 'f', name: 'A', bot: 'b' }, bridge })
  assert.deepEqual(calls[0], ['gate'])
  assert.deepEqual(calls[1], ['action', 'set_friend_add_request', true])
  assert.equal(calls.some((c) => c[0] === 'identityBegin'), true)
  assert.equal(calls.some((c) => c[0] === 'reply'), true)
})

test('friend：白名单外自动拒绝，不问候', async () => {
  const { bridge, calls } = makeBridge()
  await onRequest({ request: { requestType: 'friend', userId: 2, flag: 'f', name: 'B', bot: 'b' }, bridge })
  assert.deepEqual(calls[1], ['action', 'set_friend_add_request', false])
  assert.equal(calls.some((c) => c[0] === 'reply'), false)
})

test('friend：闸门拒绝时记 warn 不继续', async () => {
  const { bridge, calls, marks } = makeBridge({ gate: { run: async () => ({ ok: false, reason: '注入' }) } })
  await onRequest({ request: { requestType: 'friend', userId: 1, flag: 'f', bot: 'b' }, bridge })
  assert.equal(calls.some((c) => c[0] === 'action'), false)
  assert.ok(marks.some((m) => String(m.reason).includes('闸门拒绝')))
})

test('非 friend 且 verify 关闭：直接返回', async () => {
  const { bridge, marks } = makeBridge({ config: { recordInbound: false, allowUsers: [], allowGroups: [], verifyEnabled: false } })
  await onRequest({ request: { requestType: 'group', groupId: 9, userId: 1 }, bridge })
  assert.ok(marks.some((m) => String(m.reason).includes('verifyEnabled=false')))
})

test('群不在白名单 / 队列满', async () => {
  const { bridge, marks } = makeBridge()
  await onRequest({ request: { requestType: 'group', groupId: 8, userId: 1 }, bridge })
  assert.ok(marks.some((m) => String(m.reason).includes('不在 allowGroups')))

  const full = makeBridge({ joinGuard: { addRequest: () => null } })
  await onRequest({ request: { requestType: 'group', groupId: 9, userId: 1 }, bridge: full.bridge })
  assert.ok(full.marks.some((m) => String(m.reason).includes('队列已满')))
})

test('口令命中自动批准并通知', async () => {
  const { bridge, calls } = makeBridge()
  await onRequest({ request: { requestType: 'group', groupId: 9, userId: 1, flag: 'g', comment: '芝麻开门', subType: 'add' }, bridge })
  assert.equal(calls.some((c) => c[0] === 'notify'), true)
})

test('普通申请入队并通知管理员', async () => {
  const { bridge, calls } = makeBridge()
  await onRequest({ request: { requestType: 'group', groupId: 9, userId: 1, flag: 'g', comment: '你好', subType: 'add' }, bridge })
  assert.equal(calls.some((c) => c[0] === 'notifyAdmin'), true)
  assert.equal(calls.some((c) => c[0] === 'snapshot'), true)
})
