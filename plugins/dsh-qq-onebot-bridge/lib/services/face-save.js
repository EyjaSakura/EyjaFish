// 把收藏图保存到 QQ 表情（通过 NapCat add_custom_face），并回填 resId/emojiId。
/** @param {any} args */
export async function saveFaceToQq({
  item,
  dirWin,
  server,
  faces,
  mkdir,
  writeFile,
  readFile,
  now = Date.now(),
  debugLog = () => {},
}) {
  if (!item || !item.file) return false
  try {
    const socket = server.currentSocket()
    if (!socket) { debugLog('[save-fav] no socket'); return false }
    const ext = (String(item.file).match(/\.[a-z0-9]+$/i) || ['.png'])[0]
    mkdir(dirWin, { recursive: true })
    const fn = 'desc-' + now.toString(36) + ext
    writeFile(dirWin + '\\' + fn, readFile(item.file))
    const before = await server.action(socket, 'fetch_custom_face_detail', { count: 100 }).catch(() => null)
    const beforeIds = new Set((Array.isArray(before) ? before : before?.emojiInfoList || []).map((e) => String(e.resId || e.res_id || '')))
    await server.action(socket, 'add_custom_face', { file: '/tmp/qq-customface/' + fn, is_origin: true, md5: item.md5 || undefined })
    const after = await server.action(socket, 'fetch_custom_face_detail', { count: 100 }).catch(() => null)
    const afterList = Array.isArray(after) ? after : after?.emojiInfoList || []
    const fresh = afterList.find((e) => !beforeIds.has(String(e.resId || e.res_id || '')))
    if (fresh) {
      item.qqResId = fresh.resId || fresh.res_id || ''
      item.qqEmojiId = fresh.emojiId ?? fresh.emoji_id ?? 0
      item.qqMd5 = fresh.md5 || ''
      item.qqUrl = fresh.url || ''
    }
    faces.save()
    debugLog('[save-fav] saved after desc: ' + item.name + ' res_id=' + (item.qqResId || '?'))
    return true
  } catch (error) {
    debugLog('[save-fav] failed: ' + error.message)
    return false
  }
}
