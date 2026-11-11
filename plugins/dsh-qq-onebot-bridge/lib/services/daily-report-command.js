// /日报 on|off command for a chat.
export async function handleDailyReportCommand({ bridge, message, text }) {
  const t = String(text ?? '').trim()
  const m = /^[\/／]?(日报|群日报)\s*(on|off|开|关|开启|关闭)?$/i.exec(t)
  if (!m) return false
  if (!bridge.canRun(message, 'cmd.dailyreport').allowed) {
    await bridge.safeReply(message, '⚠️ 只有管理员可以开关每日日报。')
    return true
  }
  const chatKey = bridge.routeKey(message)
  const on = ['on', '开', '开启'].includes(String(m[2] ?? '').toLowerCase())
  const off = ['off', '关', '关闭'].includes(String(m[2] ?? '').toLowerCase())
  if (!on && !off) {
    const chats = bridge.dailyReportStore.read()?.chats ?? []
    await bridge.safeReply(message, `每日日报当前：${chats.includes(chatKey) ? '开' : '关'}（发送 /日报 on 或 /日报 off 切换）`)
    return true
  }
  bridge.dailyReportStore.mutate((data) => {
    const chats = new Set(Array.isArray(data.chats) ? data.chats : [])
    if (on) chats.add(chatKey)
    else chats.delete(chatKey)
    data.chats = [...chats]
  })
  await bridge.safeReply(message, on ? '✅ 已开启本会话的每日日报。' : '✅ 已关闭本会话的每日日报。')
  return true
}
