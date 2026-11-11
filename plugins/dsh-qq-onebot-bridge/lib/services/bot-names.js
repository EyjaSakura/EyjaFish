// 学习机器人自己的昵称/群名片（用于识别文本 @）。
/** @param {any} args */
export async function learnBotNames({ server, config = {}, debugLog = () => {} }) {
  const socket = server.currentSocket()
  if (!socket) return null
  const learned = []
  try {
    const info = await server.getLoginInfo(socket)
    const nickname = String(info?.nickname ?? '').trim()
    if (nickname !== '') learned.push(nickname)
  } catch (error) {
    debugLog(`learn bot nickname failed: ${error.message}`)
  }
  for (const groupId of config.allowGroups ?? []) {
    try {
      const member = await server.getGroupMemberInfo(socket, groupId, config.botQq)
      const card = String(member?.card ?? '').trim()
      if (card !== '') learned.push(card)
    } catch (error) {
      debugLog(`learn bot card failed (g${groupId}): ${error.message}`)
    }
  }
  return { names: learned, failed: learned.length === 0 }
}
