// 路由/会话键：从 bridge 抽出的纯函数，便于单测。

export function routeKey(message, config = {}) {
  if (message.messageType === 'private') return `u:${message.userId}`
  return config.sessionMode === 'chat' ? `g:${message.groupId}` : `g:${message.groupId}:u:${message.userId}`
}

export function routeOf(message) {
  return {
    bot: message.bot,
    messageType: message.messageType,
    targetId: message.messageType === 'group' ? message.groupId : message.userId,
  }
}

export function chatKeyOf(route) {
  return route.messageType === 'group' ? `g:${route.targetId}` : `u:${route.targetId}`
}
