// Small local command handlers previously embedded in bridge.js.
// They receive the bridge as an explicit host so bridge.js stays wiring-only.
import { parseFortuneIntent, dailyFortune, drawLot, drawTarot, formatFortune, formatLot, formatTarot } from '../fortune.js'
import { parseDice, rollDice, formatRoll, parsePickCommand, pickRandom, formatPick } from '../dice.js'
import { IdiomChain, GuessNumber, parseGameStartIntent, parseGameStopIntent } from '../games.js'
import { formatActivity } from '../stats.js'
import { formatLeaderboard } from '../points.js'
import { formatMcStatus, parseMcAddress, pingMcServer } from '../mcping.js'
import { debugLog } from '../core/debug-log.js'
import { handlePointsCommand as handlePointsCommandService } from './points-command.js'
import { handleActiveGame as handleActiveGameService } from './active-game.js'

export async function handleKeywordAdmin(bridge, message, cmd) {
  const key = bridge.routeKey(message)
  if (cmd.action === 'list') {
    const entries = bridge.keywordStore.list(key)
    if (entries.length === 0) {
      await bridge.safeReply(message, '词库是空的。用法：/kw add 触发词 回复内容')
      return
    }
    const lines = entries.slice(0, 20).map((entry) => `· [${entry.source === 'chat' ? '本会话' : '全局'}/${entry.match}] ${entry.trigger} → ${entry.reply.join(' / ') || '（图片）'}`)
    await bridge.safeReply(message, `📚 词库（${entries.length} 条，显示前 20）\n${lines.join('\n')}`)
    return
  }
  if (cmd.action === 'add') {
    if (!cmd.reply) {
      await bridge.safeReply(message, '要带上回复内容哦：/kw add 触发词 回复内容')
      return
    }
    const ok = bridge.keywordStore.add({ trigger: cmd.trigger, reply: [cmd.reply], match: 'contains', scope: 'all' }, key)
    if (ok) bridge.keywordStore.save()
    await bridge.safeReply(message, ok ? `✅ 已添加：${cmd.trigger} → ${cmd.reply}` : '⚠️ 添加失败（触发词或回复不合法）')
    return
  }
  const removed = bridge.keywordStore.remove(cmd.trigger, key)
  if (removed) bridge.keywordStore.save()
  await bridge.safeReply(message, removed ? `✅ 已删除：${cmd.trigger}` : `⚠️ 没找到：${cmd.trigger}`)
}

export async function handleFortune(bridge, message, text) {
  const intent = parseFortuneIntent(text)
  if (!intent) return false
  const name = message.senderName || ''
  if (intent === 'lot') {
    await bridge.safeReply(message, formatLot(drawLot(message.userId)))
    return true
  }
  if (intent === 'tarot') {
    await bridge.safeReply(message, formatTarot(drawTarot(message.userId, text)))
    return true
  }
  await bridge.safeReply(message, formatFortune(dailyFortune(message.userId, name)))
  return true
}

export async function handleDice(bridge, message, text) {
  const spec = parseDice(text)
  if (spec) {
    await bridge.safeReply(message, formatRoll(rollDice(spec)))
    return true
  }
  const pick = parsePickCommand(text)
  if (pick) {
    await bridge.safeReply(message, formatPick(pickRandom(pick.items, pick.count), pick.items))
    return true
  }
  return false
}

export async function handlePointsCommand(bridge, message, text) {
  return handlePointsCommandService({
    message,
    text,
    routeKey: (m) => bridge.routeKey(m),
    safeReply: (m, t) => bridge.safeReply(m, t),
    pointsStore: bridge.pointsStore,
    config: bridge.config,
    formatLeaderboard,
  })
}

export function awardMessagePoints(bridge, message) {
  try {
    const amount = Math.max(0, Number(bridge.config.pointsPerMessage) || 0)
    if (amount <= 0) return
    const key = bridge.routeKey(message)
    const result = bridge.pointsStore.messageBonus(key, message.userId, {
      amount,
      dailyCap: Math.max(0, Number(bridge.config.pointsDailyCap) || 20),
    })
    if (result.granted && message.senderName) bridge.pointsStore.setName(key, message.userId, message.senderName)
  } catch (error) {
    debugLog(`points award failed: ${error.message}`)
  }
}

export async function handleGameCommand(bridge, message, text) {
  const t = String(text ?? '').trim()
  const key = bridge.routeKey(message)
  if (parseGameStopIntent(t)) {
    const had = bridge.games.delete(key)
    await bridge.safeReply(message, had ? '游戏结束啦～下次再玩！' : '现在没有在玩的游戏哦。')
    return true
  }
  const start = parseGameStartIntent(t)
  if (!start) return false
  if (start === 'idiom') {
    const seconds = Math.max(30, Number(bridge.config.idiomChainTimeoutSeconds) || 120)
    const chain = new IdiomChain({ timeoutMs: seconds * 1000 })
    const first = chain.start()
    if (!first) {
      await bridge.safeReply(message, '词库空啦，玩不了接龙。')
      return true
    }
    bridge.games.set(key, { kind: 'idiom', chain })
    await bridge.safeReply(message, `🐟 成语接龙开始！我先来：「${first}」\n请接「${first[3]}」开头的四字成语（${Math.round(seconds / 60)} 分钟内有效）`)
    return true
  }
  const max = Math.max(10, Number(bridge.config.guessNumberMax) || 100)
  const tries = Math.max(1, Number(bridge.config.guessNumberMaxTries) || 10)
  bridge.games.set(key, { kind: 'guess', guess: new GuessNumber({ min: 1, max, maxTries: tries }) })
  await bridge.safeReply(message, `🎯 猜数字开始！我想好了一个 1-${max} 的数字，你有 ${tries} 次机会～`)
  return true
}

export async function handleActiveGame(bridge, message, text) {
  return handleActiveGameService({
    message,
    text,
    games: bridge.games,
    routeKey: bridge.routeKey(message),
    safeReply: (m, t) => bridge.safeReply(m, t),
  })
}

export function recordStats(bridge, message) {
  try {
    if (String(message.text ?? '').trim().startsWith('/')) return
    bridge.statsStore.record(bridge.routeKey(message), message.userId, message.senderName || '')
  } catch (error) {
    debugLog(`stats record failed: ${error.message}`)
  }
}

export async function handleStatsCommand(bridge, message, text) {
  const t = String(text ?? '').trim()
  if (!/^[\/／]?(统计|活跃榜|群活跃|周榜|统计周|周活跃)$/.test(t)) return false
  const key = bridge.routeKey(message)
  const weekly = /周榜|统计周|周活跃/.test(t)
  const days = weekly ? 7 : 1
  const rows = bridge.statsStore.top(key, { days, limit: 10 })
  await bridge.safeReply(message, formatActivity(rows, { title: weekly ? '📊 本周群活跃榜' : '📊 今日群活跃榜' }))
  return true
}

export async function handleMcStatus(bridge, message, text) {
  const t = String(text ?? '').trim()
  if (!/^[\/／]?(mc|mcstatus|mc状态|服务器状态)(\s|$)/i.test(t)) return false
  const address = parseMcAddress(t)
  if (!address) {
    await bridge.safeReply(message, '用法：/mc mc.example.com:25565（可省略端口，默认 25565）')
    return true
  }
  try {
    const result = await pingMcServer(address.host, address.port, Math.max(1000, Number(bridge.config.mcStatusTimeoutMs) || 5000))
    await bridge.safeReply(message, formatMcStatus(result, { address: `${address.host}:${address.port}` }))
  } catch (error) {
    await bridge.safeReply(message, `⚠️ 查询失败：${error.message.slice(0, 80)}`)
  }
  return true
}
