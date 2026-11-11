import test from 'node:test'
import assert from 'node:assert/strict'
import {
  extractReminderContent, parseReminder, parseRecurrence,
  nextRecurrenceAt, describeRecurrence, parseRecurringReminder,
} from '../lib/reminders.js'

test('extractReminderContent', () => {
  assert.equal(extractReminderContent('提醒我 30分钟后 喝水'), '喝水')
  assert.equal(extractReminderContent('@123 明天9:00 记得吃药'), '记得吃药')
  assert.equal(extractReminderContent('每天8点'), '时间到了')
})

test('parseReminder：相对时间', () => {
  const now = Date.now()
  const r = parseReminder('提醒我 30分钟后 喝水')
  assert.ok(r.dueAt > now)
  assert.match(r.content, /喝水/)
  assert.ok(parseReminder('提醒我 45秒后 看一眼').dueAt > now)
  assert.ok(parseReminder('提醒我 2小时后 开会').dueAt > now)
  assert.ok(parseReminder('提醒我 3天后 交作业').dueAt > now)
})

test('parseReminder：绝对时间 / 非法', () => {
  assert.ok(parseReminder('明天9点提醒我喝水').dueAt > 0)
  assert.ok(parseReminder('后天 20:30 提醒我打电话').dueAt > 0)
  assert.ok(parseReminder('今天15点提醒我收衣服').dueAt > 0)
  assert.equal(parseReminder('提醒我 25点 睡觉'), null)
  assert.equal(parseReminder('提醒我'), null)
  assert.equal(parseReminder(''), null)
  assert.equal(parseReminder('每天8点提醒我'), null)
  assert.equal(parseReminder('喝水', true), null)
  assert.ok(parseReminder('30分钟后喝水', false).dueAt > 0)
})

test('parseRecurrence', () => {
  assert.deepEqual(parseRecurrence('每天8点'), { kind: 'daily', hour: 8, minute: 0 })
  assert.deepEqual(parseRecurrence('每周一9点'), { kind: 'weekly', weekday: 1, hour: 9, minute: 0 })
  assert.deepEqual(parseRecurrence('每个工作日下午3点'), { kind: 'weekday', hour: 15, minute: 0 })
  assert.equal(parseRecurrence('每天8点').minute, 0)
  assert.equal(parseRecurrence('每天晚上8点').hour, 20)
  assert.equal(parseRecurrence('随便'), null)
  assert.equal(parseRecurrence('每天25点'), null)
})

test('nextRecurrenceAt / describeRecurrence', () => {
  const now = new Date(2026, 10, 9, 12, 0, 0).getTime() // 周一
  assert.ok(nextRecurrenceAt({ kind: 'daily', hour: 13, minute: 0 }, now) > now)
  assert.ok(nextRecurrenceAt({ kind: 'weekly', weekday: 3, hour: 9 }, now) > now)
  const weekend = new Date(2026, 10, 14, 12, 0, 0).getTime() // 周六
  assert.equal(nextRecurrenceAt({ kind: 'weekday', hour: 9 }, weekend), new Date(2026, 10, 16, 9, 0, 0).getTime())
  assert.equal(nextRecurrenceAt(null, now), null)
  assert.match(describeRecurrence({ kind: 'daily', hour: 8, minute: 0 }), /每天 08:00/)
  assert.match(describeRecurrence({ kind: 'weekly', weekday: 1, hour: 9 }), /周一/)
  assert.match(describeRecurrence({ kind: 'weekday', hour: 9 }), /工作日/)
  assert.equal(describeRecurrence(null), '')
})

test('parseRecurringReminder', () => {
  const r = parseRecurringReminder('每天8点提醒我喝水')
  assert.equal(r.kind, 'daily')
  assert.ok(r.nextAt > Date.now())
  assert.match(r.content, /喝水/)
  assert.equal(parseRecurringReminder('每天8点喝水', true), null)
  assert.equal(parseRecurringReminder(''), null)
  assert.equal(parseRecurringReminder('提醒我喝水'), null)
})
