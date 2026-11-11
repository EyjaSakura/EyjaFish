// /找 关键词：本地历史归档检索。
/** @param {any} args */
export async function handleHistorySearch({
  message,
  text,
  config = {},
  canRun,
  archive,
  chatKey,
  safeReply,
  formatHistoryLines,
}) {
  if (config.historySearchEnabled === false) return false
  if (!canRun(message, 'cmd.history.search').allowed) return false
  const matched = /^[\/／](?:找|搜索|搜)\s*(.*)$/.exec(String(text ?? '').trim())
  if (!matched) return false
  const keyword = matched[1].trim()
  if (keyword === '') {
    await safeReply(message, '用法：/找 关键词（空格分隔多个词表示同时包含）')
    return true
  }
  if (!archive) {
    await safeReply(message, '⚠️ 历史归档未开启（historyArchiveEnabled=false），无法检索。')
    return true
  }
  const days = Math.max(1, Number(config.historySearchDays) || 7)
  const limit = Math.max(1, Number(config.historySearchLimit) || 20)
  let result
  try {
    result = archive.search(keyword, { days, limit, chatKey })
  } catch (error) {
    await safeReply(message, `⚠️ 检索失败：${error.message.slice(0, 80)}`)
    return true
  }
  if (!result.hits || result.hits.length === 0) {
    await safeReply(message, `🔍 最近 ${days} 天没找到「${keyword}」（已扫 ${result.scanned ?? 0} 条消息）`)
    return true
  }
  const asMessages = result.hits.map((hit) => ({
    id: '',
    userId: hit.userId,
    name: hit.name,
    time: Math.floor((Number(hit.ts) || 0) / 1000),
    text: hit.text,
  }))
  const formatted = formatHistoryLines(asMessages, {
    limit,
    selfId: Number(config.botQq) || 0,
    title: `搜索「${keyword}」最近 ${days} 天`,
  })
  const more = result.truncated ? `（命中更多，已只显示 ${formatted.used} 条）` : ''
  await safeReply(message, `${formatted.text}${more ? `\n${more}` : ''}`)
  return true
}
