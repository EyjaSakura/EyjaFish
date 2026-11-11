/**
 * @param {{ entry: any, approve: boolean, offline?: boolean, trace?: any, server: any, gate: any, joinGuard: any, debugLog?: (message: string) => void }} args
 */
// 审批一条入群/好友申请：离线拒绝、只能同意的可疑好友、doubt/group/friend 三种 action、闸门与队列清理。
export async function resolveJoin({ entry, approve, offline = false, trace, server, gate, joinGuard, debugLog = () => {} }) {
  if (offline) {
    trace?.event({ id: '', stage: 'verify', ok: false, reason: `注入/回放回合不真的审批（#${entry?.id} ${entry?.kind || 'group'} ${approve ? '同意' : '拒绝'}）` })
    return false
  }
  if (approve === false && entry?.approveOnly === true) {
    trace?.event({ id: '', stage: 'verify', ok: false, reason: `#${entry.id} 只能同意：可疑好友申请在 NapCat 侧会忽略 approve` })
    return false
  }
  const socket = server.currentSocket()
  if (!socket) return false
  const isDoubt = entry?.kind === 'doubt'
  const isGroup = !isDoubt && entry.groupId !== 0
  const action = isDoubt ? 'set_doubt_friends_add_request' : isGroup ? 'set_group_add_request' : 'set_friend_add_request'
  const result = await gate.run(action, 'verify', `#${entry.id} ${approve ? 'ok' : 'no'}`, () => {
    if (isDoubt) return server.setDoubtFriendsAddRequest(socket, entry.flag)
    return isGroup
      ? server.setGroupAddRequest(socket, entry.flag, entry.subType, approve, '')
      : server.setFriendAddRequest(socket, entry.flag, approve, '')
  })
  if (!result.ok) {
    debugLog(`verify resolve denied: ${result.reason}`)
    return false
  }
  joinGuard.resolve(entry.id, approve)
  debugLog(`join request #${entry.id} ${approve ? 'approved' : 'rejected'}`)
  return true
}
