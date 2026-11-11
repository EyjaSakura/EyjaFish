// 收集消息里的图片表情，存入 faces，并记录消息映射。
/** @param {any} args */
export async function collectSticker({
  message,
  faces,
  stickerMsgLink,
  now = Date.now(),
  debugLog = () => {},
  onCollected = () => {},
}) {
  const raw = message.raw && message.raw.message
  if (!Array.isArray(raw)) return
  for (const segment of raw) {
    if (!segment || segment.type !== 'image') continue
    debugLog('[sticker] seg type=' + segment.type + ' sub_type=' + (segment.data && segment.data.sub_type) + ' summary=' + (segment.data && segment.data.summary || ''))
    const url = segment.data && (segment.data.url || segment.data.file)
    if (!url || url.startsWith('file://')) continue
    try {
      const name = `表情${now.toString(36).slice(-4)}`
      const added = await faces.addRemoteImage(url, name)
      const picked = { name: added?.name || name, md5: added?.md5 || '', file: added?.file || '', duplicate: Boolean(added && added.name !== name) }
      if (added && !added.desc) added.pendingDesc = true
      stickerMsgLink(message.messageId, picked.name)
      faces.save()
      onCollected(picked)
      debugLog(`sticker ${added && added.name !== name ? 'duplicate->' + added.name : 'collected as ' + picked.name}`)
    } catch (error) {
      debugLog(`sticker collect failed: ${error.message}`)
    }
  }
}
