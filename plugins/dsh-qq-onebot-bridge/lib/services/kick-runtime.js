// Second-confirmation group kick.
import { debugLog } from '../core/debug-log.js'

export async function handleKickConfirm({ bridge, message, word }) {
  const key = bridge.routeKey(message)
  const pending = bridge.pendingKicks.get(key)
  if (!pending || message.userId !== pending.adminId) return
  bridge.pendingKicks.delete(key)
  if (word === '取消') {
    await bridge.safeReply(message, '已取消踢人操作。')
    return
  }
  if (Date.now() > pending.expiresAt) {
    await bridge.safeReply(message, '⚠️ 确认已超时（60 秒），操作取消。')
    return
  }
  const socket = bridge.server.currentSocket()
  if (!socket) {
    await bridge.safeReply(message, '⚠️ 当前无可用连接，稍后再试。')
    return
  }
  try {
    await bridge.server.setGroupKick(socket, pending.route.targetId, pending.userId)
    await bridge.safeReply(message, '✅ 已执行移出操作。')
    debugLog(`admin kick u${pending.userId} g${pending.route.targetId}`)
  } catch (error) {
    await bridge.safeReply(message, `⚠️ 踢人失败：${error.message.slice(0, 80)}`)
  }
}
