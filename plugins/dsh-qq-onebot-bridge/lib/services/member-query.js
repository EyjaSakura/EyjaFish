// 群成员只读查询：列表 / at 或昵称/QQ 号详情。
import { formatMemberInfo, formatMemberList } from '../members.js'

/** @param {any} args */
export async function queryGroupMembers({
  groupId,
  query,
  server,
  config = {},
  dryRunAck,
}) {
  const socket = server.currentSocket()
  if (!socket) return { ok: false, reason: '当前无可用 OneBot 连接' }
  const selfId = Number(config.botQq) || 0
  const membersOf = (raw) => (Array.isArray(raw) ? raw : (Array.isArray(raw?.members) ? raw.members : []))
  if (query.kind === 'list') {
    const raw = await server.getGroupMemberList(socket, groupId, true)
    if (dryRunAck(raw)) return { ok: false, reason: '回放/注入模式（dry-run）不访问 QQ，取不到真实成员名单' }
    const formatted = formatMemberList(membersOf(raw), { limit: config.memberListLimit, selfId })
    return { ok: true, text: formatted.text }
  }
  let target = Number(query.userId) || 0
  if (!target && query.name) {
    const raw = await server.getGroupMemberList(socket, groupId, false)
    if (dryRunAck(raw)) return { ok: false, reason: '回放/注入模式（dry-run）不访问 QQ，无法按昵称查找成员' }
    const list = membersOf(raw)
    const needle = String(query.name).trim().toLowerCase()
    // 群名片优先级：**去空白后回落到昵称**。直接 `card ?? nickname` 会让"没设群名片的成员"
    // （OneBot 给 card:""）永远匹配不上——`''.includes(needle)` 恒为 false。
    const nameOf = (item) => String(item?.card ?? '').trim().toLowerCase() || String(item?.nickname ?? '').trim().toLowerCase()
    const hit = list.find((item) => nameOf(item) === needle) ?? list.find((item) => nameOf(item).includes(needle))
    target = Number(hit?.user_id) || 0
    if (!target) return { ok: false, reason: `没有找到「${String(query.name).slice(0, 20)}」这位成员` }
  }
  if (!target) return { ok: false, reason: '没有指定成员（可以 at 他，或给昵称/QQ 号）' }
  const info = await server.getGroupMemberInfo(socket, groupId, target)
  if (dryRunAck(info)) return { ok: false, reason: '回放/注入模式（dry-run）不访问 QQ，取不到成员详情' }
  return { ok: true, text: formatMemberInfo(info, { selfId }) }
}
