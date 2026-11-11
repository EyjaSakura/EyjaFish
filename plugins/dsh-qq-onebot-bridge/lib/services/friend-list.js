// /好友：私聊查询好友列表（最多显示 20 个）。
/** @param {any} args */
export async function handleFriendList({ message, text, config = {}, canRun, server, safeReply }) {
  if (config.friendListEnabled !== true) return false
  if (message.messageType !== 'private' || !canRun(message, 'cmd.friendlist').allowed) return false
  if (!/^[\/／](好友|好友列表)$/.test(String(text ?? '').trim())) return false
  if (message.__injected === true || message.__replayed === true) {
    await safeReply(message, '（回放/注入模式不访问 QQ，取不到好友列表）')
    return true
  }
  const socket = server.currentSocket()
  if (!socket) {
    await safeReply(message, '⚠️ 当前无可用连接，稍后再试。')
    return true
  }
  try {
    const raw = await server.getFriendList(socket)
    const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.friends) ? raw.friends : [])
    if (list.length === 0) {
      await safeReply(message, '👥 好友列表是空的。')
      return true
    }
    const lines = list.slice(0, 20).map((item, index) => {
      const name = String(item?.remark || item?.nickname || `QQ${item?.user_id ?? ''}`)
      return `${index + 1}. ${name}（${item?.user_id ?? '?'}）`
    })
    await safeReply(message, `👥 好友 ${list.length} 人${list.length > 20 ? '（显示前 20）' : ''}\n${lines.join('\n')}`)
  } catch (error) {
    await safeReply(message, `⚠️ 查询好友失败：${error.message.slice(0, 80)}`)
  }
  return true
}
