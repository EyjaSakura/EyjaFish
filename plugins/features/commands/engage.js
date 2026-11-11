// 自动抽取自 bridge.js #handleEngageCommand
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, unlinkSync, statSync } from 'node:fs'
import { join, basename, dirname, extname } from 'node:path'
import * as qqSdk from '@zfqxuz/dsh-qq-onebot-bridge/lib/sdk/index.js'

const { formatEmojiLikes, formatReactionBoard, parseEmojiLikesResult, parseEngageArgs, planPoke, planSendLike } = qqSdk

export async function handleEngageCommand({ message, text, bridge, defineTool, debugLog }) {
  const raw = String(text ?? '').trim()
  if (!/^[\/／](戳|点赞|赞榜|谁赞了)(?:\s|$)/.test(raw)) return false
  const isGroup = message.messageType === 'group'
  const chatKey = isGroup ? `g:${message.groupId}` : `u:${message.userId}`

  // —— 本地读命令：/赞榜 ——
  if (/^[\/／]赞榜\s*$/.test(raw)) {
    if (!bridge.engageOn('reactionStatsEnabled')) {
      await bridge.safeReply(message, `📊 表情统计未启用（engageEnabled=${bridge.config.engageEnabled === true}，reactionStatsEnabled=${bridge.config.reactionStatsEnabled === true}）`)
      bridge.trace?.event({ id: '', stage: 'engage', ok: false, reason: `未启用表情统计：engageEnabled=${bridge.config.engageEnabled === true}，reactionStatsEnabled=${bridge.config.reactionStatsEnabled === true}` })
      return true
    }
    const rows = bridge.reactions.topMessages({ limit: 10, chatKey })
    const textOut = formatReactionBoard(rows, { limit: 10, textOf: (messageId) => bridge.recentTexts.get(String(messageId)) ?? '' })
    await bridge.safeReply(message, textOut)
    bridge.trace?.event({ id: '', stage: 'engage', ok: true, reason: `赞榜：本地统计 ${rows.length} 条（只读本地 JSON，不访问 QQ）` })
    return true
  }

  // —— /谁赞了 [消息ID]（不给 ID 时用引用消息）——
  if (/^[\/／]谁赞了(?:\s|$)/.test(raw)) {
    if (!bridge.engageOn('reactionStatsEnabled')) {
      await bridge.safeReply(message, `📊 表情统计未启用（engageEnabled=${bridge.config.engageEnabled === true}，reactionStatsEnabled=${bridge.config.reactionStatsEnabled === true}）`)
      bridge.trace?.event({ id: '', stage: 'engage', ok: false, reason: '未启用表情统计，/谁赞了 无可查数据' })
      return true
    }
    const parsedWho = parseEngageArgs(raw, raw.slice(0, 1) + '谁赞了')
    const explicit = /^\d+$/.test(parsedWho.arg) ? parsedWho.arg : ''
    const messageId = explicit !== '' ? explicit : String(message.reply?.messageId ?? '')
    if (messageId === '') {
      await bridge.safeReply(message, '📊 用法：/谁赞了 <消息ID>，或者引用那条消息再发 /谁赞了')
      bridge.trace?.event({ id: '', stage: 'engage', ok: false, reason: '未指定消息 ID，也没有引用消息' })
      return true
    }
    // 本地统计先给一份（永远可用）；群里再试真机的 get_emoji_likes 拿实时名单。
    const local = bridge.reactions.byEmoji(messageId)
    let live = null
    let liveReason = ''
    if (isGroup && bridge.engageOn('reactionStatsEnabled')) {
      if (message.__injected === true || message.__replayed === true) {
        // 这条调用不带会话键之外的群号以外的信息，注入/回放回合必须自己判：绝不打到真 QQ。
        liveReason = '注入/回放回合不调用 get_emoji_likes（本地统计照样可查）'
      } else {
        try {
          const emojiId = local[0]?.emojiId ?? bridge.config.emojiLikeId ?? '128077'
          const socket = message.bot ?? bridge.server.currentSocket()
          const result = await bridge.server.getEmojiLikes(socket, messageId, emojiId, { groupId: message.groupId, count: 50 })
          live = [parseEmojiLikesResult(result, { emojiId })]
          liveReason = '实时名单来自 get_emoji_likes'
        } catch (error) {
          liveReason = `get_emoji_likes 失败，改用本地统计：${error.message}`
        }
      }
    } else if (!isGroup) {
      liveReason = '私聊不支持 get_emoji_likes（该 API 面向群消息）'
    }
    const rows = live ?? local
    const source = live ? 'get_emoji_likes 实时' : '本地统计'
    await bridge.safeReply(message, formatEmojiLikes(rows, { messageId, source }))
    bridge.trace?.event({ id: '', stage: 'engage', ok: true, reason: `${liveReason || '本地统计'}；共 ${rows.length} 组表情` })
    return true
  }

  // —— /戳 <@某人|QQ号>（管理员，主动戳）——
  if (/^[\/／]戳(?:\s|$)/.test(raw)) {
    if (!bridge.engageOn('pokeCommandEnabled')) {
      await bridge.safeReply(message, `👉 主动戳未启用（engageEnabled=${bridge.config.engageEnabled === true}，pokeCommandEnabled=${bridge.config.pokeCommandEnabled === true}）`)
      bridge.trace?.event({ id: '', stage: 'engage', ok: false, reason: `未启用主动戳：engageEnabled=${bridge.config.engageEnabled === true}，pokeCommandEnabled=${bridge.config.pokeCommandEnabled === true}` })
      return true
    }
    if (!(bridge.config.adminEnabled && bridge.canRun(message, 'admin.config').allowed)) {
      await bridge.safeReply(message, '⚠️ 主动戳仅管理员可用。')
      bridge.trace?.event({ id: '', stage: 'engage', ok: false, reason: '主动戳仅管理员可用' })
      return true
    }
    const target = bridge.engageTarget(message, raw)
    if (target <= 0) {
      await bridge.safeReply(message, '👉 用法：/戳 @某人 或 /戳 <QQ号>')
      bridge.trace?.event({ id: '', stage: 'engage', ok: false, reason: '主动戳没有解析到目标' })
      return true
    }
    if (bridge.engageWriteBlocked(message)) {
      await bridge.safeReply(message, `👉 戳未执行：${bridge.engageBlockedReason('主动戳')}`)
      bridge.trace?.event({ id: '', stage: 'engage', ok: false, reason: bridge.engageBlockedReason('主动戳') })
      return true
    }
    const plan = planPoke({ groupId: isGroup ? message.groupId : undefined, targetId: target })
    if (!plan.ok) {
      await bridge.safeReply(message, `⚠️ 戳失败：${plan.reason}`)
      bridge.trace?.event({ id: '', stage: 'engage', ok: false, reason: plan.reason })
      return true
    }
    const quotaKey = `poke:${chatKey}`
    const now = Date.now()
    const quota = bridge.pokeQuota.check(quotaKey, now, '戳一戳')
    if (!quota.ok) {
      await bridge.safeReply(message, `⚠️ 戳失败：${quota.reason}`)
      bridge.trace?.event({ id: '', stage: 'engage', ok: false, reason: quota.reason })
      return true
    }
    const gated = await bridge.gate.run(plan.action, chatKey, `manual u${target}`, () => (plan.action === 'group_poke'
      ? bridge.server.groupPoke(message.bot, plan.params.group_id, plan.params.user_id)
      : bridge.server.friendPoke(message.bot, plan.params.user_id)))
    if (gated.ok !== true) {
      await bridge.safeReply(message, `⚠️ 戳被闸门拦下：${gated.reason}`)
      bridge.trace?.event({ id: '', stage: 'engage', ok: false, reason: gated.reason })
      return true
    }
    bridge.pokeQuota.record(quotaKey, now)
    bridge.saveEngageState()
    await bridge.safeReply(message, `👉 戳了 ${target} 一下${gated.dryRun === true ? '（干跑：没有真的发到 QQ）' : ''}`)
    bridge.trace?.event({ id: '', stage: 'engage', ok: true, reason: `主动戳 u${target}（action=${plan.action}，本小时第 ${quota.used.hour + 1} 次）` })
    return true
  }

  // —— /点赞 [@某人|QQ号]（不给目标就给自己）——
  if (/^[\/／]点赞(?:\s|$)/.test(raw)) {
    if (!bridge.engageOn('sendLikeEnabled')) {
      await bridge.safeReply(message, `👍 点赞未启用（engageEnabled=${bridge.config.engageEnabled === true}，sendLikeEnabled=${bridge.config.sendLikeEnabled === true}）`)
      bridge.trace?.event({ id: '', stage: 'engage', ok: false, reason: `未启用点赞：engageEnabled=${bridge.config.engageEnabled === true}，sendLikeEnabled=${bridge.config.sendLikeEnabled === true}` })
      return true
    }
    const resolved = bridge.engageTarget(message, raw)
    const target = resolved > 0 ? resolved : message.userId
    if (bridge.engageWriteBlocked(message)) {
      await bridge.safeReply(message, `👍 点赞未执行：${bridge.engageBlockedReason('点赞')}`)
      bridge.trace?.event({ id: '', stage: 'engage', ok: false, reason: bridge.engageBlockedReason('点赞') })
      return true
    }
    const plan = planSendLike({ userId: target, times: bridge.config.sendLikeTimes })
    if (!plan.ok) {
      await bridge.safeReply(message, `⚠️ 点赞失败：${plan.reason}`)
      bridge.trace?.event({ id: '', stage: 'engage', ok: false, reason: plan.reason })
      return true
    }
    const quotaKey = `like:${target}`
    const now = Date.now()
    const quota = bridge.likeQuota.check(quotaKey, now, '点赞')
    if (!quota.ok) {
      await bridge.safeReply(message, `⚠️ 点赞失败：${quota.reason}`)
      bridge.trace?.event({ id: '', stage: 'engage', ok: false, reason: quota.reason })
      return true
    }
    const gated = await bridge.gate.run('send_like', chatKey, `u${target} x${plan.params.times}`, () => bridge.server.sendLike(message.bot, plan.params.user_id, plan.params.times))
    if (gated.ok !== true) {
      await bridge.safeReply(message, `⚠️ 点赞被闸门拦下：${gated.reason}`)
      bridge.trace?.event({ id: '', stage: 'engage', ok: false, reason: gated.reason })
      return true
    }
    bridge.likeQuota.record(quotaKey, now)
    bridge.saveEngageState()
    await bridge.safeReply(message, `👍 给 ${target} 点了 ${plan.params.times} 个赞${plan.clamped ? '（次数已按 QQ 上限夹紧）' : ''}${gated.dryRun === true ? '（干跑：没有真的发到 QQ）' : ''}`)
    bridge.trace?.event({ id: '', stage: 'engage', ok: true, reason: `点赞 u${target} x${plan.params.times}（今天第 ${quota.used.day + 1} 次）` })
    return true
  }

  return false
}
