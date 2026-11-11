import test from 'node:test'
import assert from 'node:assert/strict'
import { addReminder, cancelReminderByKey, cancelReminder, listReminders } from '../lib/services/reminder-command.js'

function harness(overrides = {}) {
  const replies = []
  const calls = []
  const reminders = new Map()
  const deps = {
    message: { messageType: 'group', groupId: 9, userId: 1 },
    parsed: { dueAt: 1_000_000 + 60_000, content: '喝水' },
    config: { reminderMaxPerChat: 2 },
    routeKey: 'g:9',
    reminders,
    saveReminders: () => calls.push('save'),
    scheduleReminder: () => calls.push('schedule'),
    safeReply: async (_m, t) => replies.push(t),
    debugLog: () => {},
    now: 1_000_000,
    ...overrides,
  }
  return { deps, replies, calls, reminders }
}

test('添加：太近 / 太远 / 超上限', async () => {
  const near = harness({ parsed: { dueAt: 1_000_000 + 1000, content: 'x' } })
  await addReminder(near.deps)
  assert.match(near.replies[0], /至少设置 5 秒/)

  const far = harness({ parsed: { dueAt: 1_000_000 + 31 * 86_400_000, content: 'x' } })
  await addReminder(far.deps)
  assert.match(far.replies[0], /30 天内/)

  const full = harness()
  full.reminders.set('a', { id: 'a', key: 'g:9' })
  full.reminders.set('b', { id: 'b', key: 'g:9' })
  await addReminder(full.deps)
  assert.match(full.replies[0], /最多同时保留/)
})

test('添加：普通 / 重复 / 注入标记', async () => {
  const { deps, replies, calls, reminders } = harness()
  await addReminder(deps)
  assert.match(replies[0], /将在/)
  assert.equal(reminders.size, 1)
  assert.equal(calls.includes('save'), true)
  assert.equal(calls.includes('schedule'), true)

  const rec = harness({ parsed: { dueAt: 1_000_000, content: '每天', rule: { kind: 'daily', hour: 8, minute: 0 } } })
  await addReminder(rec.deps)
  assert.match(rec.replies[0], /每天 08:00/)

  const injected = harness({ message: { messageType: 'private', userId: 2, __injected: true } })
  await addReminder(injected.deps)
  assert.equal([...injected.reminders.values()][0].injected, true)
})

test('取消：无 / 最后一个 / 全部 / 关键词', () => {
  const none = harness()
  assert.match(cancelReminderByKey({ key: 'g:9', reminders: none.reminders, saveReminders: () => {} }), /没有待执行/)

  const h = harness()
  h.reminders.set('a', { id: 'a', key: 'g:9', content: '喝水' })
  h.reminders.set('b', { id: 'b', key: 'g:9', content: '吃饭' })
  assert.match(cancelReminderByKey({ key: 'g:9', reminders: h.reminders, saveReminders: () => {} }), /吃饭/)
  assert.equal(h.reminders.has('b'), false)

  const all = harness()
  all.reminders.set('a', { id: 'a', key: 'g:9', content: '喝水' })
  all.reminders.set('b', { id: 'b', key: 'g:9', content: '吃饭' })
  cancelReminderByKey({ key: 'g:9', arg: 'all', reminders: all.reminders, saveReminders: () => {} })
  assert.equal(all.reminders.size, 0)

  const kw = harness()
  kw.reminders.set('a', { id: 'a', key: 'g:9', content: '喝水' })
  kw.reminders.set('b', { id: 'b', key: 'g:9', content: '吃饭' })
  cancelReminderByKey({ key: 'g:9', arg: '喝', reminders: kw.reminders, saveReminders: () => {} })
  assert.equal(kw.reminders.has('a'), false)
})

test('cancelReminder / listReminders 包装', async () => {
  const h = harness()
  await cancelReminder(h.deps)
  assert.match(h.replies[0], /没有待执行/)

  const empty = harness()
  await listReminders(empty.deps)
  assert.match(empty.replies[0], /没有待执行/)

  const list = harness()
  list.reminders.set('a', { id: 'a', key: 'g:9', dueAt: 1_000_000, content: '喝水' })
  await listReminders(list.deps)
  assert.match(list.replies[0], /待执行提醒（1 个）/)
})
