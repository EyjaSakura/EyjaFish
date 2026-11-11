// 把一条用户内容交给 agent，并记录“这一回合是谁触发的”（注入回合必须记账）。
export function handoff({ entry, message, payload, trace, createUserMessage, now = Date.now() }) {
  const injectedTurn = message?.__injected === true
  entry.pendingTurns.push({ injected: injectedTurn, at: now })
  if (entry.pendingTurns.length > 32) {
    entry.pendingTurns.splice(0, entry.pendingTurns.length - 32)
    trace?.event({
      id: entry.lastTraceId,
      stage: 'inject',
      ok: false,
      level: 'warn',
      chatKey: entry.key,
      reason: '回合记账队列积压超过 32 条，已截断最早的记账（宿主可能没有上报 turn/start）',
    })
  }
  if (injectedTurn) {
    trace?.event({
      id: entry.lastTraceId,
      stage: 'inject',
      ok: true,
      chatKey: entry.key,
      reason: '注入帧已转交 agent：本回合的回复会被 dry-run 拦下',
    })
  }
  return entry.handle.agent.followup(createUserMessage({ ...payload, content: payload.content }))
}
