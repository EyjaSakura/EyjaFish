// 发起群投票：建 vote、设定时器、发提示。
/** @param {any} args */
export async function startVote({
  message,
  vc,
  config = {},
  votes,
  timers,
  routeKey,
  safeReply,
  publishVote,
  setTimeoutImpl = setTimeout,
}) {
  if (message.messageType !== 'group') {
    await safeReply(message, '⚠️ 投票仅支持群聊。')
    return
  }
  const key = routeKey(message)
  if (votes.has(key)) {
    await safeReply(message, '⚠️ 本群已有进行中的投票，先 /vote-end 结束再开新的。')
    return
  }
  const durationMs = Math.max(10, Number(config.voteDurationSeconds) || 300) * 1000
  const vote = {
    question: vc.question,
    options: vc.options,
    votes: new Map(),
    route: { messageType: 'group', targetId: message.groupId },
    /** @type {any} */
    timer: null,
    ...(message.__injected === true ? { injected: true } : {}),
  }
  const timer = setTimeoutImpl(() => {
    timers.delete(timer)
    votes.delete(key)
    void publishVote(vote)
  }, durationMs)
  vote.timer = timer
  timers.add(timer)
  votes.set(key, vote)
  const lines = vc.options.map((o) => `${o.key}：${o.label}`)
  await safeReply(message, `🗳️ 投票开始（${Math.round(durationMs / 60_000)} 分钟后截止）：${vc.question}\n${lines.join('\n')}\n群友直接回复选项字母投票；/vote 查进度，/vote-end 提前结束。`)
}
