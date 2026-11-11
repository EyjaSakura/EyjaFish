// /相册 群相册列表.
import { formatAlbumList } from '../assets.js'

export async function handleAlbum({ bridge, message, text }) {
  if (bridge.config.albumEnabled === false) return false
  if (!bridge.canRun(message, 'cmd.album').allowed) return false
  if (message.messageType !== 'group') return false
  if (!/^[\/／](?:相册|群相册)$/.test(String(text ?? '').trim())) return false
  const socket = bridge.server.currentSocket()
  if (!socket) {
    await bridge.safeReply(message, '⚠️ 当前无可用连接，稍后再试。')
    return true
  }
  try {
    const raw = await bridge.server.getQunAlbumList(socket, message.groupId)
    if (bridge.dryRunAck(raw)) {
      await bridge.safeReply(message, '（回放/注入模式不访问 QQ，取不到真实群相册）')
      return true
    }
    const albums = Array.isArray(raw) ? raw : (Array.isArray(raw?.album_list) ? raw.album_list : (Array.isArray(raw?.albums) ? raw.albums : []))
    await bridge.safeReply(message, formatAlbumList(albums, { limit: Math.max(1, Number(bridge.config.groupFileListLimit) || 20) }).text)
  } catch (error) {
    await bridge.safeReply(message, `⚠️ 查询群相册失败：${error.message.slice(0, 80)}`)
  }
  return true
}
