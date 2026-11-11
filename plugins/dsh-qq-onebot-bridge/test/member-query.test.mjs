import test from 'node:test'
import assert from 'node:assert/strict'
import { queryGroupMembers } from '../lib/services/member-query.js'

function harness(overrides = {}) {
  const deps = {
    groupId: 9,
    query: { kind: 'list' },
    server: {
      currentSocket: () => ({}),
      getGroupMemberList: async () => ({ members: [{ user_id: 1, nickname: '小明', card: '' }] }),
      getGroupMemberInfo: async () => ({ user_id: 1, nickname: '小明' }),
    },
    config: { botQq: 99, memberListLimit: 10 },
    dryRunAck: () => false,
    ...overrides,
  }
  return deps
}

test('无 socket', async () => {
  const r = await queryGroupMembers(harness({ server: { currentSocket: () => null } }))
  assert.equal(r.ok, false)
  assert.match(r.reason, /无可用 OneBot/)
})

test('列表 + dry-run', async () => {
  const r = await queryGroupMembers(harness())
  assert.equal(r.ok, true)
  assert.match(r.text, /小明/)

  const dry = await queryGroupMembers(harness({ dryRunAck: () => true }))
  assert.equal(dry.ok, false)
  assert.match(dry.reason, /dry-run/)
})

test('按昵称查找（空群名片回落昵称）', async () => {
  const r = await queryGroupMembers(harness({ query: { kind: 'member', name: '小明' } }))
  assert.equal(r.ok, true)
  assert.match(r.text, /小明/)
})

test('找不到 / 未指定 / 详情 dry-run', async () => {
  const miss = await queryGroupMembers(harness({ query: { kind: 'member', name: '不存在' } }))
  assert.equal(miss.ok, false)
  assert.match(miss.reason, /没有找到/)

  const none = await queryGroupMembers(harness({ query: { kind: 'member' } }))
  assert.equal(none.ok, false)
  assert.match(none.reason, /没有指定成员/)

  const dry = await queryGroupMembers(harness({ query: { kind: 'member', userId: 1 }, dryRunAck: () => true }))
  assert.equal(dry.ok, false)
})
