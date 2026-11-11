// 投票进度 / 提前结束 / 公布 / 计票。
/** @param {any} args */
export async function showVote({ message, routeKey, votes, safeReply }) {
  const key = routeKey(message)
  const vote = votes.get(key)
  if (!vote) {
    await safeReply(message, '当前没有进行中的投票。发起方式：「投票：问题？A 选项 B 选项」。')
    return
  }
  const counts = {}
  for (const o of vote.options) counts[o.key] = 0
  for (const k of vote.votes.values()) counts[k] = (counts[k] ?? 0) + 1
  const lines = vote.options.map((o) => `${o.key} ${o.label}：${counts[o.key] ?? 0} 票`)
  await safeReply(message, `🗳️ ${vote.question}\n${lines.join('\n')}\n共 ${vote.votes.size} 人已投。`)
}

/** @param {any} args */
export async function endVote({
  message,
  routeKey,
  votes,
  timers,
  clearTimer = clearTimeout,
  publishVote,
  safeReply,
}) {
  const key = routeKey(message)
  const vote = votes.get(key)
  if (!vote) {
    await safeReply(message, '当前没有进行中的投票。')
    return
  }
  votes.delete(key)
  if (vote.timer) {
    clearTimer(vote.timer)
    timers.delete(vote.timer)
  }
  await publishVote(vote)
}

/** @param {any} args */
export async function publishVote({
  vote,
  injectedTaskBlocked,
  chatKeyOf,
  server,
  trace,
  debugLog = () => {},
}) {
  // 注入帧发起的投票：到点（或 /vote-end）只记事件，不把结果发进 QQ
  if (injectedTaskBlocked({ ...vote, key: chatKeyOf(vote.route) }, '投票结果')) return
  const counts = {}
  for (const o of vote.options) counts[o.key] = 0
  for (const k of vote.votes.values()) counts[k] = (counts[k] ?? 0) + 1
  const lines = vote.options.map((o) => `${o.key} ${o.label}：${counts[o.key] ?? 0} 票`)
  const socket = server.currentSocket()
  if (!socket) {
    debugLog('vote publish skipped: no socket')
    trace?.event({ id: '', stage: 'vote', ok: false, reason: '投票结果未公布：当前没有可用的 OneBot 连接（QQ 掉线）' })
    return
  }
  try {
    await server.sendSegments(socket, vote.route.messageType, vote.route.targetId, [{ type: 'text', data: { text: `🗳️ 投票结束：${vote.question}\n${lines.join('\n')}\n共 ${vote.votes.size} 人参与。` } }])
    debugLog('vote published')
  } catch (error) {
    debugLog(`vote publish failed: ${error.message}`)
  }
}

/** @param {any} args */
export function maybeVote({ message, routeKey, votes, debugLog = () => {} }) {
  if (message.messageType !== 'group') return false
  const key = routeKey(message)
  const vote = votes.get(key)
  if (!vote) return false
  const t = message.text.trim()
  const opt = vote.options.find((o) => o.key === t.toUpperCase() || o.label === t)
  if (!opt) return false
  vote.votes.set(message.userId, opt.key)
  debugLog(`vote counted u${message.userId} -> ${opt.key}`)
  return true
}
