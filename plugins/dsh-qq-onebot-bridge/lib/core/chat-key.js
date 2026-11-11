// 由 chatKey 造最小 message：启动占位/对账时用来解析 route 与角色。

export function syntheticMessageForKey(key, bot = false) {
  const parts = String(key).split(':')
  if (parts[0] === 'u' && parts[1] !== undefined && parts[1] !== '') {
    return { bot, messageType: 'private', userId: Number(parts[1]), text: '' }
  }
  if (parts[0] === 'g' && parts[1] !== undefined && parts[1] !== '') {
    const userId = parts[3] !== undefined && parts[3] !== '' ? Number(parts[3]) : 0
    return { bot, messageType: 'group', groupId: Number(parts[1]), userId, text: '' }
  }
  return undefined
}
