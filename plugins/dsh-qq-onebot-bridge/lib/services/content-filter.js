// 刷屏与敏感词拦截；管理员豁免。返回 true 表示消息已被处理。
/** @param {any} args */
export async function handleContentFilter({
  message,
  text,
  config = {},
  canRun,
  chatKey,
  groupId,
  socket,
  floodGuard,
  gate,
  server,
  safeReply,
  wordFilter,
  debugLog = () => {},
}) {
  if (canRun(message, 'admin.config').allowed) return false
  if (config.floodEnabled) {
    const flood = floodGuard.observe(chatKey, message.userId)
    if (flood.action === 'mute' && groupId && socket) {
      const result = await gate.run('set_group_ban', `g:${groupId}`, `flood u${message.userId}`, () => server.setGroupBan(socket, groupId, message.userId, flood.muteSeconds))
      if (result.ok) {
        await safeReply(message, `🔇 ${message.senderName || message.userId} 刷屏太猛啦，先冷静 ${Math.round(flood.muteSeconds / 60)} 分钟吧。`)
      }
      return true
    }
    if (flood.action === 'warn') {
      await safeReply(message, `⚠️ ${message.senderName || '你'} 慢一点哦，刷屏会被禁言的（${flood.strike}/${Math.max(1, Number(config.floodStrikeLimit) || 3)}）。`)
      return true
    }
  }
  if (config.filterEnabled && text !== '') {
    const hit = wordFilter.check(text)
    if (!hit.hit) return false
    const action = String(config.filterAction || 'warn')
    debugLog(`badword hit g${groupId} u${message.userId} word=${hit.word}`)
    if (action === 'recall' && groupId && socket) {
      const result = await gate.run('delete_msg', `g:${groupId}`, `badword u${message.userId}`, () => server.deleteMsg(socket, message.messageId))
      if (result.ok) await safeReply(message, `🚫 ${message.senderName || '你'} 的消息包含敏感词，已撤回。`)
      return true
    }
    if (action === 'mute' && groupId && socket) {
      const seconds = Math.max(60, Number(config.filterMuteSeconds) || 300)
      const result = await gate.run('set_group_ban', `g:${groupId}`, `badword u${message.userId}`, () => server.setGroupBan(socket, groupId, message.userId, seconds))
      if (result.ok) await safeReply(message, `🔇 ${message.senderName || '你'} 的消息包含敏感词，禁言 ${Math.round(seconds / 60)} 分钟。`)
      return true
    }
    await safeReply(message, `⚠️ ${message.senderName || '你'} 的消息包含敏感词，请注意群规。`)
    return true
  }
  return false
}
