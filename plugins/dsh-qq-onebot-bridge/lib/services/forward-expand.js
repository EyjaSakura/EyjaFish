// 转发聊天记录展开：优先用调用方提供的 forwardText，否则走 get_forward_msg。
import { isForwardPayload, normalizeForwardNodes, formatForwardTranscript } from '../forward.js'

/** @param {any} args */
export async function expandForwards({ message, maxNodes, maxChars, getForwardMsg, currentSocket, debugLog = () => {} }) {
  const provided = typeof message.forwardText === 'string' ? message.forwardText.trim() : ''
  const offline = message.__injected === true || message.__replayed === true
  if (provided !== '') {
    const truncated = provided.length > maxChars
    const body = truncated ? `${provided.slice(0, maxChars)}…（内容过长已截断）` : provided
    return { text: `[转发的聊天记录（回放/注入提供）]\n${body}`, used: 1, total: 1, truncated, source: 'provided' }
  }
  if (offline) {
    return {
      text: '', used: 0, total: 0, truncated: false, source: 'offline',
      reason: '回放/注入模式不访问 QQ，且本次没有提供 forwardText（真实运行时才会用 get_forward_msg 展开）',
    }
  }
  const allIds = (Array.isArray(message.forwards) ? message.forwards : [])
    .map((item) => (item && item.id !== undefined && item.id !== null ? String(item.id) : ''))
    .filter((id) => id !== '')
  const ids = allIds.slice(0, 3)
  const skippedCards = allIds.length - ids.length
  if (ids.length === 0) {
    return { text: '', used: 0, total: 0, truncated: false, source: 'none', skippedCards: 0, reason: '转发卡片没有 id，无法展开' }
  }
  const socket = message.bot ?? currentSocket()
  const parts = []
  let used = 0
  let total = 0
  let truncated = false
  let dryRun = false
  let failures = 0
  for (const id of ids) {
    let data
    try {
      data = await getForwardMsg(socket, id)
    } catch (error) {
      failures++
      debugLog(`forward fetch failed id=${id}: ${error.message}`)
      continue
    }
    if (!isForwardPayload(data)) {
      if (data && data.dryRun === true) dryRun = true
      continue
    }
    const normalized = normalizeForwardNodes(data)
    const formatted = formatForwardTranscript(normalized.nodes, { maxNodes, maxChars })
    if (formatted.text) parts.push(formatted.text)
    used += formatted.used
    total += formatted.total
    if (formatted.truncated) truncated = true
  }
  if (parts.length === 0) {
    return {
      text: '', used: 0, total, truncated, source: dryRun ? 'dry-run' : 'empty', skippedCards,
      reason: dryRun
        ? '回放/注入模式（dry-run）下拿不到转发内容'
        : failures > 0
          ? `转发内容获取失败（${failures} 次调用出错）`
          : '转发内容为空或无法解析',
    }
  }
  return { text: parts.join('\n'), used, total, truncated, source: 'api', skippedCards }
}
