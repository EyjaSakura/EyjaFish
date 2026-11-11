// Group member / group info read-only commands.
import { parseMemberQuery } from '../members.js'
import { queryGroupMembers as queryGroupMembersService } from './member-query.js'

export async function queryGroupMembers(bridge, groupId, query) {
  return queryGroupMembersService({
    groupId,
    query,
    server: bridge.server,
    config: bridge.config,
    dryRunAck: (raw) => bridge.dryRunAck(raw),
  })
}

export async function handleMemberQuery(bridge, message, text) {
  if (message.messageType !== 'group') return false
  const query = parseMemberQuery(text, message.ats)
  if (!query) return false
  try {
    const result = await queryGroupMembers(bridge, message.groupId, query)
    await bridge.safeReply(message, result.ok ? result.text : `⚠️ ${result.reason}`)
  } catch (error) {
    await bridge.safeReply(message, `⚠️ 查询成员失败：${error.message.slice(0, 80)}`)
  }
  return true
}

export async function handleGroupInfo(bridge, message, text) {
  if (message.messageType !== 'group') return false
  if (!/^[\/／](群信息|群资料)$/.test(String(text ?? '').trim())) return false
  const socket = bridge.server.currentSocket()
  if (!socket) {
    await bridge.safeReply(message, '⚠️ 当前无可用连接，稍后再试。')
    return true
  }
  try {
    const info = (await bridge.server.getGroupInfo(socket, message.groupId)) ?? {}
    if (bridge.dryRunAck(info)) {
      await bridge.safeReply(message, '（回放/注入模式不访问 QQ，取不到真实群资料）')
      return true
    }
    const lines = [
      `👥 ${info.group_name ?? '未知群名'}`,
      `群号：${info.group_id ?? message.groupId}`,
      `人数：${info.member_count ?? '未知'}${info.max_member_count ? ` / ${info.max_member_count}` : ''}`,
    ]
    if (info.owner_id) lines.push(`群主：${info.owner_id}`)
    if (info.group_create_time) lines.push(`建群时间：${new Date(Number(info.group_create_time) * 1000).toLocaleString('zh-CN', { hour12: false })}`)
    await bridge.safeReply(message, lines.join('\n'))
  } catch (error) {
    await bridge.safeReply(message, `⚠️ 查询群信息失败：${error.message.slice(0, 80)}`)
  }
  return true
}
