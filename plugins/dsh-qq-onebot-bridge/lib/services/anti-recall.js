// 防撤回：校验白名单/缓存/冷却后，把撤回内容补发到群里或管理员私聊。
/** @param {any} args */
export async function handleRecallNotice({
  notice,
  config,
  recallCache,
  recallLastAt,
  gate,
  server,
  formatRecallNotice,
  debugLog = () => {},
  now = Date.now(),
}) {
  const isGroup = notice.groupId !== undefined && notice.groupId !== 0
  if (isGroup) {
    if (!config.allowGroups.includes(notice.groupId)) return
    if (config.allowUsers.length > 0 && !config.allowUsers.includes(notice.userId)) return
  } else if (!config.allowUsers.includes(notice.userId)) {
    return
  }
  const chatKey = isGroup ? `g:${notice.groupId}` : `u:${notice.userId}`
  const entry = recallCache.recall(chatKey, notice.messageId)
  if (!entry) {
    debugLog(`recall notice without cached message id=${notice.messageId}`)
    return
  }
  if (notice.operatorId === config.botQq || entry.userId === config.botQq) return
  const cooldown = Math.max(2, Number(config.antiRecallCooldownSeconds) || 5) * 1000
  const last = recallLastAt.get(chatKey) ?? 0
  if (now - last < cooldown) {
    debugLog('anti-recall rate limited')
    return
  }
  recallLastAt.set(chatKey, now)
  const notice2 = formatRecallNotice(entry, { botName: config.botName || '小鲸鱼' })
  const text = typeof notice2 === 'string' ? notice2 : notice2.text
  const images = (typeof notice2 === 'object' && Array.isArray(notice2.images)) ? notice2.images : []
  const postInGroup = isGroup && config.antiRecallInGroup !== false
  const route = postInGroup
    ? { bot: notice.bot, messageType: 'group', targetId: notice.groupId }
    : { bot: notice.bot, messageType: 'private', targetId: (config.adminUsers ?? [])[0] }
  if (!route.targetId) {
    debugLog('anti-recall has nowhere to post (no adminUsers)')
    return
  }
  const result = await gate.run('anti_recall_notice', chatKey, `id=${notice.messageId}`, () => server.sendSegments(
    route.bot, route.messageType, route.targetId, [{ type: 'text', data: { text } }],
  ))
  if (!result.ok) {
    debugLog(`anti-recall denied: ${result.reason}`)
    return
  }
  if (config.antiRecallImages !== false && images.length > 0 && postInGroup) {
    try {
      await server.sendSegments(route.bot, route.messageType, route.targetId,
        images.slice(0, 3).map((url) => ({ type: 'image', data: { file: url } })))
    } catch (error) {
      debugLog(`anti-recall image resend failed: ${error.message}`)
    }
  }
  debugLog(`anti-recall posted (${chatKey} u${entry.userId})`)
}
