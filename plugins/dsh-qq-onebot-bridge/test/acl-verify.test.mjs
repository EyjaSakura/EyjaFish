import test from 'node:test'
import assert from 'node:assert/strict'
import { builtinRoles, emptyPolicy, resolveScope, rolesFor, evaluate, explain, limitsFor } from '../lib/acl.js'
import {
  buildVerifyQuestion, normalizeAnswer, checkVerifyAnswer, JoinGuard,
  parseVerifyCommand, formatPendingRemain, formatPendingList, formatJoinPrompt,
} from '../lib/verify.js'

test('builtinRoles / emptyPolicy', () => {
  const roles = builtinRoles()
  assert.ok(roles.admin.permissions.length > 0)
  assert.ok(roles.guest.permissions.includes('cmd.chat'))
  assert.equal(emptyPolicy().defaultRole, 'guest')
})

test('resolveScope / rolesFor', () => {
  assert.equal(resolveScope('own', 'user:1'), 'user:1')
  assert.equal(resolveScope('shared'), 'shared')
  assert.equal(resolveScope('*'), '*')
  const p = emptyPolicy()
  assert.deepEqual(rolesFor(p, 'user:1'), ['guest'])
  p.assignments = { 'user:1': ['admin'] }
  assert.deepEqual(rolesFor(p, 'user:1'), ['admin'])
})

test('evaluate：允许 / 缺权限 / deny / 未知', () => {
  const p = emptyPolicy()
  assert.equal(evaluate(p, 'user:1', { need: ['cmd.help'] }).allowed, true)
  assert.equal(evaluate(p, 'user:1', { need: ['group.ops.kick'] }).reason, 'missing-permission')
  p.subjectDenies = { 'user:1': ['cmd.help'] }
  assert.equal(evaluate(p, 'user:1', { need: ['cmd.help'] }).reason, 'denied')
  assert.equal(evaluate(p, 'user:1', { need: ['not.a.permission'] }).reason, 'unknown-permission')
})

test('limitsFor / explain', () => {
  const p = emptyPolicy()
  const d = evaluate(p, 'user:1', { need: ['cmd.help'] })
  assert.match(explain(d), /放行/)
  assert.deepEqual(limitsFor(p, ['guest'], ['nonexistent']), {})
})

test('verify question / answer', () => {
  const q = buildVerifyQuestion(() => 0)
  assert.match(q.question, /2 \+ 2/)
  assert.equal(q.answer, '4')
  assert.equal(normalizeAnswer('答案是：１２。'), '12')
  assert.equal(checkVerifyAnswer({ answer: '12' }, '１２'), true)
  assert.equal(checkVerifyAnswer({ answer: '12' }, '13'), false)
})

test('JoinGuard：入队/列表/查询/处理/过期', () => {
  let t = 1000
  const g = new JoinGuard({ timeoutSeconds: 60, maxPending: 1, rng: () => 0, now: () => t })
  const r = g.addRequest({ flag: 'f1', userId: 5, comment: 'hi' })
  assert.equal(g.size, 1)
  assert.equal(g.addRequest({ flag: 'f2', userId: 6 }), null)
  assert.equal(g.find(r.id).flag, 'f1')
  assert.equal(g.find('f1').id, r.id)
  assert.equal(g.list().length, 1)
  assert.equal(g.list()[0].remainingSeconds > 0, true)
  const resolved = g.resolve(r.id, true)
  assert.equal(resolved.ok, true)
  assert.equal(g.size, 0)
  assert.equal(g.resolve('nope', true).ok, false)
})

test('JoinGuard：adopt 无题目 + expire + clear', () => {
  let t = 1000
  const g = new JoinGuard({ timeoutSeconds: 60, rng: () => 0, now: () => t })
  const r = g.addRequest({ flag: 'f', userId: 1, adopt: true })
  assert.equal(r.question, '')
  t = 2000 + 86_400_000
  assert.equal(g.expire(t).length, 1)
  g.addRequest({ flag: 'x', userId: 2, adopt: true })
  g.clear()
  assert.equal(g.size, 0)
})

test('parseVerifyCommand / 格式化', () => {
  assert.deepEqual(parseVerifyCommand('/待审'), { action: 'list', target: '' })
  assert.deepEqual(parseVerifyCommand('/同意 3'), { action: 'approve', target: '3' })
  assert.deepEqual(parseVerifyCommand('拒绝 all'), { action: 'reject', target: 'all' })
  assert.equal(parseVerifyCommand('随便'), null)
  assert.equal(formatPendingRemain(59), '59s')
  assert.equal(formatPendingRemain(3600), '1 小时')
  assert.equal(formatPendingRemain(86_400), '1 天')
  assert.equal(formatPendingList([]), '📭 暂无待处理请求。')
  const list = formatPendingList([{ id: 1, userId: 5, groupId: 9, comment: 'hi', remainingSeconds: 30, adopted: true, approveOnly: true }])
  assert.match(list, /补拉/)
  assert.match(list, /只能同意/)
  assert.match(formatJoinPrompt({ id: 1, userId: 5, groupId: 9, comment: 'hi', question: '1+1' }), /新请求/)
})
