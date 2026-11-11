// 自动抽取自 bridge.js #handleAdminCommand
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, unlinkSync, statSync } from 'node:fs'
import { join, basename, dirname, extname } from 'node:path'

export async function handleAdminCommand({ message, cmd, arg, bridge, defineTool, debugLog }) {
  const groupOnly = cmd === 'mute' || cmd === 'unmute' || cmd === 'kick' ||
    cmd === '公告' || cmd === '精华' || cmd === '取消精华' || cmd === '名片' ||
    cmd === '头衔' || cmd === '全员禁言' || cmd === '解除全员禁言' || cmd === '退群'
  if (groupOnly && message.messageType !== 'group') {
    await bridge.safeReply(message, '⚠️ 该命令仅支持群聊。')
    return
  }
  // 权限自愈（v0.5.8）：group_admin 事件已经明确告诉我们被撤管理员时，
  // 不要再让 API 去撞墙（用户只会看到一句模糊的失败），直接说清真实原因。
  // `/clear` 是纯本地操作、`/退群` 只需要普通成员权限（`set_group_leave`），都不拦。
  if (cmd !== 'clear' && cmd !== '退群' && message.messageType === 'group') {
    const blocked = bridge.botAdminBlockedReason(message.groupId)
    if (blocked !== '') {
      await bridge.safeReply(message, `⚠️ ${blocked}`)
      bridge.trace?.event({ id: '', stage: 'admin', ok: false, reason: blocked })
      return
    }
  }
  const key = bridge.routeKey(message)
  if (cmd === 'clear') {
    await bridge.rotate(message)
    bridge.clearMemory(key)
    await bridge.safeReply(message, '✅ 会话与持久化记忆已清空。')
    return
  }
  const socket = bridge.server.currentSocket()
  if (!socket) {
    await bridge.safeReply(message, '⚠️ 当前无可用连接，稍后再试。')
    return
  }

  // ---- 群公告 ----
  if (cmd === '公告') {
    if (!arg) {
      await bridge.safeReply(message, '用法：/公告 公告内容')
      return
    }
    const result = await bridge.gate.run('_send_group_notice', `g:${message.groupId}`, 'admin', () => bridge.server.sendGroupNotice(socket, message.groupId, arg.slice(0, 500)))
    await bridge.safeReply(message, result.ok ? '✅ 群公告已发布。' : `⚠️ 发布失败：${result.reason}`)
    return
  }

  // ---- 全员禁言 ----
  if (cmd === '全员禁言' || cmd === '解除全员禁言') {
    const enable = cmd === '全员禁言'
    const result = await bridge.gate.run('set_group_whole_ban', `g:${message.groupId}`, enable ? 'on' : 'off', () => bridge.server.setGroupWholeBan(socket, message.groupId, enable))
    await bridge.safeReply(message, result.ok ? (enable ? '🔇 已开启全员禁言。' : '🔊 已解除全员禁言。') : `⚠️ 操作失败：${result.reason}`)
    return
  }

  // ---- 退群（默认关闭；必须显式「/退群 确认」）----
  if (cmd === '退群') {
    if (bridge.config.leaveGroupEnabled !== true) {
      await bridge.safeReply(message, '⚠️ 退群功能默认关闭（leaveGroupEnabled=false）。确认要开再改配置，改完仍需 /退群 确认。')
      return
    }
    if (arg !== '确认') {
      await bridge.safeReply(message, `⚠️ 这会让机器人退出本群（${message.groupId}），且不会自动回来。确认请回复：/退群 确认`)
      return
    }
    const result = await bridge.gate.run('set_group_leave', `g:${message.groupId}`, 'admin', () => bridge.server.setGroupLeave(socket, message.groupId, false))
    await bridge.safeReply(message, result.ok ? '👋 已退出本群。' : `⚠️ 退群被拦下：${result.reason}`)
    return
  }

  // ---- 精华（对引用消息）----
  if (cmd === '精华' || cmd === '取消精华') {
    const messageId = message.reply?.messageId
    if (!messageId) {
      await bridge.safeReply(message, '用法：@我 并引用一条消息，发送 /精华 或 /取消精华')
      return
    }
    const action = cmd === '精华' ? 'set_essence_msg' : 'delete_essence_msg'
    const call = cmd === '精华' ? () => bridge.server.setEssenceMsg(socket, messageId) : () => bridge.server.deleteEssenceMsg(socket, messageId)
    const result = await bridge.gate.run(action, `g:${message.groupId}`, 'admin', call)
    await bridge.safeReply(message, result.ok ? (cmd === '精华' ? '⭐ 已设为精华消息。' : '✅ 已取消精华。') : `⚠️ 操作失败：${result.reason}`)
    return
  }

  // ---- 群名片 / 头衔（@某人 + 内容）----
  if (cmd === '名片' || cmd === '头衔') {
    const target = (message.ats ?? []).find((qq) => qq && qq !== bridge.config.botQq) ?? Number((/^\s*(\d{5,11})/.exec(arg) ?? [])[1] ?? 0)
    const value = arg.replace(/^\s*\d{5,11}\s*/, '').replace(/\[CQ:at[^\]]*\]/g, '').trim()
    if (!target || !value) {
      await bridge.safeReply(message, `用法：/${cmd} @某人 新${cmd === '名片' ? '名字' : '头衔'}`)
      return
    }
    const isCard = cmd === '名片'
    const action = isCard ? 'set_group_card' : 'set_group_special_title'
    const call = isCard
      ? () => bridge.server.setGroupCard(socket, message.groupId, target, value.slice(0, 60))
      : () => bridge.server.setGroupSpecialTitle(socket, message.groupId, target, value.slice(0, 18))
    const result = await bridge.gate.run(action, `g:${message.groupId}`, `u${target}`, call)
    await bridge.safeReply(message, result.ok ? `✅ 已更新 ${target} 的${isCard ? '群名片' : '头衔'}为「${value}」。` : `⚠️ 操作失败：${result.reason}`)
    return
  }

  const numMatch = /(?:^|\s)(\d{5,11})(?:\s|$)/.exec(arg)
  const target = numMatch ? Number(numMatch[1]) : (message.ats?.[0] ?? 0)
  if (!target) {
    await bridge.safeReply(message, '用法：/mute <QQ号或@某人> [分钟]，/unmute <QQ号或@某人>，/kick <QQ号或@某人>')
    return
  }
  if (target === bridge.config.botQq) {
    await bridge.safeReply(message, '⚠️ 不能对我自己执行这个操作哦。')
    return
  }
  if (cmd === 'mute' || cmd === 'unmute') {
    const minutesMatch = /(\d{1,4})\s*$/.exec(arg.replace(/^\s*\d{5,11}\s*/, ''))
    const minutes = cmd === 'unmute' ? 0 : Math.max(1, Math.min(1440, Number(minutesMatch?.[1] ?? 10)))
    const result = await bridge.gate.run('set_group_ban', `g:${message.groupId}`, `u${target}`, () => bridge.server.setGroupBan(socket, message.groupId, target, minutes * 60))
    if (!result.ok) {
      await bridge.safeReply(message, `⚠️ 操作失败：${result.reason}`)
      return
    }
    await bridge.safeReply(message, cmd === 'unmute' ? `✅ 已解除 ${target} 的禁言。` : `✅ 已禁言 ${target} ${minutes} 分钟。`)
    debugLog(`admin ${cmd} u${target} g${message.groupId} ${minutes}m`)
    return
  }
  if (cmd === 'kick') {
    bridge.pendingKicks.set(key, { userId: target, adminId: message.userId, route: { messageType: 'group', targetId: message.groupId }, expiresAt: Date.now() + 60_000 })
    await bridge.safeReply(message, `⚠️ 确认将 ${target} 移出本群？请回复「确认踢」执行，回复「取消」放弃（60 秒内有效）。`)
    return
  }
}
