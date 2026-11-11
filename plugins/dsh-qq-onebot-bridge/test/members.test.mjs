import test from 'node:test'
import assert from 'node:assert/strict'
import { roleLabel, formatMemberList, formatAdminList, formatMemberInfo, parseMemberQuery } from '../lib/members.js'

const now = Date.parse('2026-11-09T12:00:00Z')
const members = [
  { user_id: 300, nickname: '普通', role: 'member', level: '5' },
  { user_id: 100, card: '群主大人', role: 'owner', level: '9' },
  { user_id: 200, nickname: '管理', role: 'admin', level: '7', title: '头衔' },
]

test('roleLabel', () => {
  assert.equal(roleLabel('owner'), '群主')
  assert.equal(roleLabel('admin', true), '管理员（我）')
  assert.equal(roleLabel('member'), '成员')
})

test('formatMemberList：排序 / 自己 / 头衔 / 禁言 / 截断', () => {
  const empty = formatMemberList([], { groupName: '测试群' })
  assert.match(empty.text, /【测试群】/)
  assert.equal(empty.total, 0)

  const r = formatMemberList(members, { selfId: 200, groupName: '测试群', limit: 2, now })
  assert.equal(r.shown, 2)
  assert.equal(r.truncated, true)
  assert.match(r.text, /群主大人/)
  assert.match(r.text, /管理员（我）/)
  assert.match(r.text, /头衔/)
  assert.doesNotMatch(r.text, /普通/)
})

test('formatAdminList：无管理员 / 有管理员', () => {
  const none = formatAdminList([{ role: 'member' }])
  assert.equal(none.admins, 0)
  assert.match(none.text, /没有查到/)
  const r = formatAdminList(members, { selfId: 100 })
  assert.equal(r.owner, 1)
  assert.equal(r.admins, 1)
  assert.match(r.text, /群主 1 人、管理员 1 人/)
})

test('formatMemberInfo：空 / 完整', () => {
  assert.match(formatMemberInfo({}), /没有查到/)
  const text = formatMemberInfo({ user_id: 1, card: 'A', role: 'admin', level: '3', title: 'T', join_time: 1760000000, last_sent_time: 0, shut_up_timestamp: 0 }, { selfId: 1, now })
  assert.match(text, /显示名：A/)
  assert.match(text, /管理员（我）/)
  assert.match(text, /禁言状态：未被禁言/)
})

test('parseMemberQuery', () => {
  assert.equal(parseMemberQuery('你好'), null)
  assert.deepEqual(parseMemberQuery('/成员'), { kind: 'list' })
  assert.deepEqual(parseMemberQuery('/成员 列表'), { kind: 'list' })
  assert.deepEqual(parseMemberQuery('/成员 12345'), { kind: 'info', userId: 12345 })
  assert.deepEqual(parseMemberQuery('/成员 张三'), { kind: 'info', name: '张三' })
  assert.deepEqual(parseMemberQuery('/成员 张三', [99999]), { kind: 'info', userId: 99999 })
  assert.deepEqual(parseMemberQuery('/成员@12345'), { kind: 'info', name: '12345' })
})
