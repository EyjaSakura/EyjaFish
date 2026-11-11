// Daily check-in command.
import { debugLog } from '../core/debug-log.js'

export async function handleCheckinBoard({ bridge, message }) {
  const board = bridge.checkinStore.board(bridge.routeKey(message), 10)
  if (board.length === 0) {
    await bridge.safeReply(message, '还没有人打过卡，快来说「签到」当第一名吧！')
    return
  }
  const lines = ['📊 签到排行榜']
  board.forEach((entry, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
    const today = entry.today ? '✅' : '·'
    lines.push(`${medal} ${entry.name} ${today} 连续 ${entry.streak} 天 / 累计 ${entry.total} 天`)
  })
  await bridge.safeReply(message, lines.join('\n'))
}

export async function handleCheckin({ bridge, message }) {
  const key = bridge.routeKey(message)
  const name = message.senderName || ''
  const { firstToday, streak, total } = bridge.checkinStore.checkin(key, message.userId, name)
  if (!firstToday) {
    await bridge.safeReply(message, `今天已经打过卡啦～（连续 ${streak} 天 · 累计 ${total} 天）明天再来哦！`)
    return
  }
  const extra = streak >= 7 ? ' 🏆 全勤小标兵！' : streak >= 3 ? ' 再接再厉！' : ''
  let bonusLine = ''
  const bonus = Math.max(0, Number(bridge.config.pointsCheckinBonus) || 0)
  if (bridge.config.pointsEnabled && bonus > 0) {
    const total2 = bridge.pointsStore.add(key, message.userId, bonus, { name })
    bonusLine = `（+${bonus} 积分，共 ${total2}）`
  }
  await bridge.safeReply(message, `✅ ${name || '你'} 打卡成功！连续 ${streak} 天 · 累计 ${total} 天${extra}${bonusLine}`)
  debugLog(`checkin u${message.userId} streak=${streak} total=${total}`)
}
