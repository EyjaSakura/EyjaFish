// 提醒命令：添加、取消、列表。
import { describeRecurrence } from '../reminders.js'

/** @param {any} args */
export async function addReminder({
  message,
  parsed,
  config = {},
  routeKey,
  reminders,
  saveReminders,
  scheduleReminder,
  safeReply,
  debugLog = () => {},
  now = Date.now(),
}) {
  const key = routeKey
  const maxPerChat = Math.max(1, Number(config.reminderMaxPerChat) || 10)
  if (!parsed.rule && parsed.dueAt < now + 5_000) {
    await safeReply(message, '⚠️ 提醒时间太近了，至少设置 5 秒以后。')
    return
  }
  if (!parsed.rule && parsed.dueAt > now + 30 * 86_400_000) {
    await safeReply(message, '⚠️ 最远只能设置 30 天内的提醒。')
    return
  }
  const mine = [...reminders.values()].filter((r) => r.key === key).length
  if (mine >= maxPerChat) {
    await safeReply(message, `⚠️ 本会话最多同时保留 ${maxPerChat} 个提醒。`)
    return
  }
  const rem = {
    id: `r${now.toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    key,
    route: {
      messageType: message.messageType,
      targetId: message.messageType === 'group' ? message.groupId : message.userId,
    },
    dueAt: parsed.dueAt,
    content: parsed.content,
    ...(parsed.rule ? { rule: parsed.rule } : {}),
    ...(message.__injected === true ? { injected: true } : {}),
    timer: null,
  }
  reminders.set(rem.id, rem)
  saveReminders()
  scheduleReminder(rem)
  const when = new Date(rem.dueAt).toLocaleString('zh-CN', { hour12: false })
  const repeat = parsed.rule ? `（${describeRecurrence(parsed.rule)}）` : ''
  await safeReply(message, `⏰ 好的，将在 ${when} 提醒${repeat}：${rem.content}`)
  debugLog(`reminder added ${rem.id} due ${when}${parsed.rule ? ` rule=${parsed.rule.kind}` : ''}`)
}

/** @param {any} args */
export function cancelReminderByKey({ key, arg = '', reminders, saveReminders }) {
  const mine = [...reminders.values()].filter((r) => r.key === key)
  if (mine.length === 0) return '当前没有待执行的提醒。'
  const a = String(arg || '').trim()
  let targets
  if (!a) targets = [mine[mine.length - 1]]
  else if (/^(全部|所有|all)$/i.test(a)) targets = mine
  else {
    targets = mine.filter((r) => String(r.content || '').includes(a))
    if (targets.length === 0) targets = [mine[mine.length - 1]]
  }
  for (const r of targets) {
    try { if (r.timer) clearTimeout(r.timer) } catch { /* ignore */ }
    reminders.delete(r.id)
  }
  saveReminders()
  const names = targets.map((r) => String(r.content || '').slice(0, 20)).join('、')
  return `已取消 ${targets.length} 个提醒：${names}`
}

/** @param {any} args */
export async function cancelReminder({ message, arg = '', routeKey, reminders, saveReminders, safeReply }) {
  const detail = cancelReminderByKey({ key: routeKey, arg, reminders, saveReminders })
  await safeReply(message, detail)
}

/** @param {any} args */
export async function listReminders({ message, routeKey, reminders, safeReply }) {
  const mine = [...reminders.values()].filter((r) => r.key === routeKey)
  if (mine.length === 0) {
    await safeReply(message, '当前没有待执行的提醒。')
    return
  }
  const lines = mine.map((r) => `- ${new Date(r.dueAt).toLocaleString('zh-CN', { hour12: false })}：${r.content}${r.rule ? `（${describeRecurrence(r.rule)}）` : ''}`)
  await safeReply(message, `待执行提醒（${mine.length} 个）：\n${lines.join('\n')}`)
}
