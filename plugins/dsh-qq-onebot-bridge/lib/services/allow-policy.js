// 入站白名单策略：私聊/群聊是否允许处理。
// pendingVerifyUserIds：正在走入群/加好友验证的申请人，允许私聊答题。
export function isAllowed(message, config = {}, pendingVerifyUserIds = []) {
  const allowUsers = Array.isArray(config.allowUsers) ? config.allowUsers : []
  const allowGroups = Array.isArray(config.allowGroups) ? config.allowGroups : []

  if (message.messageType === 'private') {
    if (allowUsers.includes(message.userId)) return true
    if (config.verifyEnabled && pendingVerifyUserIds.includes(message.userId)) return true
    return false
  }
  if (!allowGroups.includes(message.groupId)) return false
  if (allowUsers.length > 0 && !allowUsers.includes(message.userId)) return false
  return true
}
