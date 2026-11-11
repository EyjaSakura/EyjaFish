// 当前会话进行中的小游戏：成语接龙 / 猜数字。
export async function handleActiveGame({ message, text, games, routeKey, safeReply }) {
  const key = routeKey
  const game = games.get(key)
  if (!game) return false
  const t = String(text ?? '').trim()
  if (t === '') return false
  if (game.kind === 'idiom') {
    if (!game.chain.active) {
      games.delete(key)
      return false
    }
    const result = game.chain.tryAnswer(t)
    if (result.ok) {
      if (result.next) {
        await safeReply(message, `✅ 接上啦！我接「${result.next}」，请接「${result.next[3]}」开头～`)
      } else {
        games.delete(key)
        await safeReply(message, `🎉 「${t}」接得漂亮，我想不出下一个啦，这局你赢！`)
      }
      return true
    }
    if (result.reason.includes('超时')) {
      games.delete(key)
      await safeReply(message, '⏰ 接龙超时啦，这局结束～想玩再发「接龙」。')
      return true
    }
    if (/^[\u4e00-\u9fa5]{4}$/.test(t)) {
      await safeReply(message, `❌ ${message.senderName || '你'}：${result.reason}`)
      return true
    }
    return false
  }
  const result = game.guess.guess(t)
  if (result.hint === 'correct') {
    games.delete(key)
    await safeReply(message, `🎉 猜对啦！答案就是 ${result.answer}（第 ${result.tries} 次猜中）`)
    return true
  }
  if (result.hint === 'bigger') {
    await safeReply(message, `📈 太小了～再大一点（第 ${result.tries} 次）`)
    return true
  }
  if (result.hint === 'smaller') {
    await safeReply(message, `📉 太大了～再小一点（第 ${result.tries} 次）`)
    return true
  }
  if (result.exhausted) {
    games.delete(key)
    await safeReply(message, `😵 次数用完啦，答案是 ${result.answer}。想再玩就发「猜数字」。`)
    return true
  }
  return false
}
