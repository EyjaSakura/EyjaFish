// Reverse lookup: sessionId -> chatKey/message.
export function messageFromRoute(route) {
  if (route === null || typeof route !== 'object') return undefined
  if (route.messageType === 'group') {
    return { bot: route.bot, messageType: 'group', groupId: Number(route.targetId), userId: 0, text: '' }
  }
  if (route.messageType === 'private') {
    return { bot: route.bot, messageType: 'private', userId: Number(route.targetId), text: '' }
  }
  return undefined
}

export function findChatForSession({ sessionId, agents, workspaceStore, sessionStore, syntheticMessageForKey }) {
  const entry = agents.get(sessionId)
  if (entry !== undefined) {
    const message = messageFromRoute(entry.route)
    if (message !== undefined) return { key: entry.key, message }
  }
  for (const store of [workspaceStore.read() ?? {}, sessionStore.read() ?? {}]) {
    for (const [key, value] of Object.entries(store)) {
      const bound = typeof value === 'string' ? value : (value?.sessionId ?? '')
      if (bound !== sessionId) continue
      const message = syntheticMessageForKey(key)
      if (message !== undefined) return { key, message }
    }
  }
  return undefined
}
