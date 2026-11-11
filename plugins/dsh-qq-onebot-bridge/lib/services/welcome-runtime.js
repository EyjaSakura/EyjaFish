// Group welcome message.
import { debugLog } from '../core/debug-log.js'

export async function handleWelcome({ bridge, notice }) {
  if (notice.userId === notice.selfId) return
  if (!bridge.config.allowGroups.includes(notice.groupId)) return
  const text = String(bridge.config.welcomeText || '').trim() ||
    '欢迎新朋友入群～我是小鲸鱼，@我聊天、说「签到」打卡都可以哦！'
  await bridge.server.sendSegments(notice.bot, 'group', notice.groupId, [
    { type: 'at', data: { qq: String(notice.userId) } },
    { type: 'text', data: { text: ` ${text}` } },
  ])
  debugLog(`welcome sent (g${notice.groupId} u${notice.userId})`)
}
