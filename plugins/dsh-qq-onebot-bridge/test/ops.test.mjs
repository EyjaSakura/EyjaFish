import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isValidQq, isValidGroupId, normalizeTargets, planGroupSign, planKickMembers,
  batchTargets, planTodo, planHistoryVisibility, parseToggle, parseInvitePolicy,
  invitePolicyLabel, planInvitePolicy, planGroupAdmin, planAddOption, formatShutRemain,
} from '../lib/ops.js'

test('validators / normalizeTargets', () => {
  assert.equal(isValidQq('12345'), true)
  assert.equal(isValidQq('123'), false)
  assert.equal(isValidGroupId('900000'), true)
  assert.equal(isValidGroupId('9'), false)
  assert.deepEqual(normalizeTargets('12345, 67890 12345 bad'), { valid: ['12345', '67890'], invalid: ['bad'] })
})

test('planGroupSign / planKickMembers / batchTargets', () => {
  assert.equal(planGroupSign({ groupId: 9 }).ok, false)
  assert.equal(planGroupSign({ groupId: 900000 }).params.group_id, '900000')

  const kick = planKickMembers({ groupId: 900000, userIds: ['12345', '67890'] })
  assert.equal(kick.ok, true)
  assert.deepEqual(kick.params.user_id, ['12345', '67890'])

  const tooMany = planKickMembers({ groupId: 900000, userIds: Array.from({ length: 21 }, (_, i) => String(10000 + i)), max: 20 })
  assert.equal(tooMany.exceeded, true)

  assert.deepEqual(batchTargets(['1', '2', '3'], 2), [])
  assert.deepEqual(batchTargets(['12345', '67890', '11111'], 2), [['12345', '67890'], ['11111']])
})

test('planTodo / planHistoryVisibility', () => {
  assert.equal(planTodo({ groupId: 900000, kind: 'bad' }).ok, false)
  assert.equal(planTodo({ groupId: 900000, messageId: '' }).ok, false)
  assert.equal(planTodo({ groupId: 900000, messageId: '1' }).params.message_id, '1')
  assert.equal(planHistoryVisibility({ groupId: 900000, visible: '开' }).params.visible, true)
  assert.equal(planHistoryVisibility({ groupId: 900000 }).ok, false)
})

test('parseToggle / invite policy', () => {
  assert.equal(parseToggle('开'), true)
  assert.equal(parseToggle('off'), false)
  assert.equal(parseToggle('?'), null)
  assert.equal(parseInvitePolicy('免审核'), 'no_approval')
  assert.equal(parseInvitePolicy('unknown'), null)
  assert.match(invitePolicyLabel('disabled'), /关闭邀请/)
  assert.equal(planInvitePolicy({ groupId: 900000, policy: 'disabled' }).ok, true)
  assert.equal(planInvitePolicy({ groupId: 900000, policy: 'bad' }).ok, false)
})

test('planGroupAdmin 必须显式 enable', () => {
  assert.equal(planGroupAdmin({ groupId: 900000, userId: '12345' }).ok, false)
  assert.equal(planGroupAdmin({ groupId: 900000, userId: '12345', enable: true }).params.enable, true)
  assert.equal(planGroupAdmin({ groupId: 900000, userId: 'bad', enable: true }).ok, false)
})

test('planAddOption', () => {
  assert.equal(planAddOption({ groupId: 900000, addType: 4 }).ok, false)
  assert.equal(planAddOption({ groupId: 900000, addType: 4, question: 'q', answer: 'a' }).params.group_answer, 'a')
  assert.equal(planAddOption({ groupId: 900000, addType: 5, question: 'q' }).params.group_answer, '')
  assert.equal(planAddOption({ groupId: 900000, addType: 0 }).ok, false)
})

test('formatShutRemain', () => {
  assert.equal(formatShutRemain(0, 1000), '已解除')
  const now = 1_000_000_000_000
  assert.match(formatShutRemain((now + 90 * 60_000) / 1000, now), /1 小时/)
  assert.match(formatShutRemain((now + 30_000) / 1000, now), /分钟/)
})
