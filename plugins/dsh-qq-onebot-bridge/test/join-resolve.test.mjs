import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveJoin } from '../lib/services/join-resolve.js'

function harness(overrides = {}) {
  const events = []
  const calls = []
  const deps = {
    entry: { id: 1, flag: 'f', groupId: 9, subType: 'add' },
    approve: true,
    trace: { event: (e) => events.push(e) },
    server: {
      currentSocket: () => 'sock',
      setGroupAddRequest: async (...a) => calls.push(['group', ...a]),
      setFriendAddRequest: async (...a) => calls.push(['friend', ...a]),
      setDoubtFriendsAddRequest: async (...a) => calls.push(['doubt', ...a]),
    },
    gate: {
      run: async (action, key, desc, fn) => {
        calls.push(['gate', action])
        await fn()
        return overrides.gateBlocked ? { ok: false, reason: '拒绝' } : { ok: true }
      },
    },
    joinGuard: { resolve: (...a) => calls.push(['resolve', ...a]) },
    debugLog: () => {},
    ...overrides,
  }
  return { deps, events, calls }
}

test('离线 / 只能同意 / 无 socket 都拒绝', async () => {
  const off = harness({ offline: true })
  assert.equal(await resolveJoin(off.deps), false)

  const doubt = harness({ approve: false, entry: { id: 1, flag: 'f', kind: 'doubt', groupId: 0, approveOnly: true } })
  assert.equal(await resolveJoin(doubt.deps), false)

  const noSock = harness({ server: { currentSocket: () => null } })
  assert.equal(await resolveJoin(noSock.deps), false)
})

test('群申请：走 set_group_add_request 并清队列', async () => {
  const { deps, calls } = harness()
  assert.equal(await resolveJoin(deps), true)
  assert.equal(calls.some((c) => c[0] === 'group'), true)
  assert.equal(calls.some((c) => c[0] === 'resolve'), true)
})

test('好友申请：走 set_friend_add_request', async () => {
  const { deps, calls } = harness({ entry: { id: 2, flag: 'f', groupId: 0, subType: 'add' }, approve: false })
  assert.equal(await resolveJoin(deps), true)
  assert.equal(calls.some((c) => c[0] === 'friend'), true)
})

test('可疑好友：走 set_doubt_friends_add_request', async () => {
  const { deps, calls } = harness({ entry: { id: 3, flag: 'f', kind: 'doubt', groupId: 0 } })
  assert.equal(await resolveJoin(deps), true)
  assert.equal(calls.some((c) => c[0] === 'doubt'), true)
})

test('闸门拒绝：返回 false 且不清队列', async () => {
  const { deps, calls } = harness({ gateBlocked: true })
  assert.equal(await resolveJoin(deps), false)
  assert.equal(calls.some((c) => c[0] === 'resolve'), false)
})
