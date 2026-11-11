// /summary and /reminders list.
import { listReminders as listRemindersService } from './reminder-command.js'
import { debugLog } from '../core/debug-log.js'

export async function handleSummary({ bridge, message }) {
  const key = bridge.routeKey(message)
  const lines = bridge.loadMemoryLines(key)
  if (lines.length === 0) {
    await bridge.safeReply(message, '我还没有记住这个会话的聊天记录（可能刚重启或聊天太少）。')
    return
  }
  const entry = await bridge.ensureSession(message)
  bridge.handoff(entry, message, {
    content: [{ type: 'text', text: `请把以下本会话最近的聊天记录总结成要点（分条列出：谁、说了什么、重要结论；如有 @我的内容请标出）：\n${lines.join('\n')}` }],
    source: { kind: 'user' },
  })
  debugLog('summary requested')
}

export async function listReminders({ bridge, message }) {
  return listRemindersService({
    message,
    routeKey: bridge.routeKey(message),
    reminders: bridge.reminders,
    safeReply: (m, t) => bridge.safeReply(m, t),
  })
}
