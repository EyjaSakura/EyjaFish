// 群只读查询：群荣誉 / 群公告 / 群精华。
import { formatHonor } from '../stats.js'

export async function handleGroupRead({ message, text, server, safeReply }) {
  const t = String(text ?? '').trim()
  if (message.messageType !== 'group') return false
  const socket = server.currentSocket()
  if (!socket) return false
  if (/^[\/／]?(荣誉|群荣誉)$/.test(t)) {
    try {
      const info = await server.getGroupHonorInfo(socket, message.groupId, 'all')
      await safeReply(message, formatHonor(info))
    } catch (error) {
      await safeReply(message, `⚠️ 查询失败：${error.message.slice(0, 80)}`)
    }
    return true
  }
  if (/^[\/／]?(公告|群公告)$/.test(t)) {
    try {
      const list = await server.getGroupNotice(socket, message.groupId)
      const items = Array.isArray(list) ? list : (Array.isArray(list?.notices) ? list.notices : [])
      if (items.length === 0) {
        await safeReply(message, '📢 这个群还没有公告。')
        return true
      }
      const lines = items.slice(0, 5).map((item, index) => {
        const content = String(item?.message?.text ?? item?.content ?? '').replace(/\s+/g, ' ').slice(0, 80)
        const sender = item?.sender_id ?? item?.sender ?? ''
        return `${index + 1}. ${content}${sender ? `（by ${sender}）` : ''}`
      })
      await safeReply(message, `📢 群公告（${items.length} 条，显示前 5）\n${lines.join('\n')}`)
    } catch (error) {
      await safeReply(message, `⚠️ 读取公告失败：${error.message.slice(0, 80)}`)
    }
    return true
  }
  if (/^[\/／]?(群精华|精华列表)$/.test(t)) {
    try {
      const list = await server.getEssenceMsgList(socket, message.groupId)
      const items = Array.isArray(list) ? list : []
      if (items.length === 0) {
        await safeReply(message, '⭐ 这个群还没有精华消息。')
        return true
      }
      const lines = items.slice(0, 5).map((item, index) => {
        const content = String(item?.message?.text ?? item?.content ?? item?.sender_nick ?? '').replace(/\s+/g, ' ').slice(0, 70)
        return `${index + 1}. ${content || `消息 ${item?.message_id ?? ''}`}`
      })
      await safeReply(message, `⭐ 群精华（${items.length} 条，显示前 5）\n${lines.join('\n')}`)
    } catch (error) {
      await safeReply(message, `⚠️ 读取精华失败：${error.message.slice(0, 80)}`)
    }
    return true
  }
  return false
}
