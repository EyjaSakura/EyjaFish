// /积分、/积分榜、/转账。
/** @param {any} args */
export async function handlePointsCommand({
  message,
  text,
  routeKey,
  safeReply,
  pointsStore,
  config = {},
  formatLeaderboard,
}) {
  const t = String(text ?? '').trim()
  if (!/^[\/／]?(积分|我的积分|积分榜|积分排行|排行榜|转账|转)(\s|$)/.test(t)) return false
  const key = routeKey(message)
  const name = message.senderName || ''
  if (/^[\/／]?(积分|我的积分)$/.test(t)) {
    await safeReply(message, `💰 ${name || '你'} 现在有 ${pointsStore.balance(key, message.userId)} 积分`)
    return true
  }
  if (/^[\/／]?(积分榜|积分排行|排行榜)$/.test(t)) {
    await safeReply(message, formatLeaderboard(pointsStore.leaderboard(key, 10)))
    return true
  }
  const transfer = /^[\/／]?(?:转账|转)\s*(.+)$/.exec(t)
  if (!transfer) return false
  const nums = (transfer[1].match(/\d+/g) ?? []).map((value) => Number(value))
  const target = (message.ats ?? []).find((qq) => qq && qq !== (config.botQq ?? 0))
    ?? nums.find((value) => String(value).length >= 5)
  const amount = [...nums].reverse().find((value) => value !== target) ?? 0
  if (!target || !amount) {
    await safeReply(message, '用法：/转账 @某人 数量（或 /转账 QQ号 数量）')
    return true
  }
  const result = pointsStore.transfer(key, message.userId, target, amount)
  if (!result.ok) {
    await safeReply(message, `⚠️ 转账失败：${result.error}`)
    return true
  }
  await safeReply(message, `✅ 已转给 ${target} ${amount} 积分（你还剩 ${result.fromBalance}）`)
  return true
}
