// 发送图片：可带 caption，Windows 路径失败时回退原生 URI。
/** @param {any} args */
export async function sendImageTo({
  route,
  file,
  caption = '',
  prepareImage,
  toOneBotFileSource,
  windowsPathToFileUri,
  sendSegments,
  trackSent,
  chatKeyOf,
  stat,
  basename,
  debugLog = () => {},
}) {
  const prepared = await prepareImage(file)
  const segments = []
  if (caption) segments.push({ type: 'text', data: { text: caption } })
  segments.push({ type: 'image', data: { file: toOneBotFileSource(prepared) } })
  let data
  try {
    data = await sendSegments(route.bot, route.messageType, route.targetId, segments)
  } catch (error) {
    // [win-path 2026-10-31] /mnt/... 不被接受时（NapCat 其实跑在 Windows 上），退回原生盘符 URI 再试一次
    const native = windowsPathToFileUri(prepared)
    if (!native) throw error
    debugLog('image send fallback to native uri: ' + error.message)
    segments[segments.length - 1] = { type: 'image', data: { file: native } }
    data = await sendSegments(route.bot, route.messageType, route.targetId, segments)
  }
  trackSent(chatKeyOf(route), data)
  const size = stat(prepared).size
  debugLog(`agent image sent (${prepared}, ${size} bytes)`)
  return `已发送图片：${basename(prepared)}（${Math.round(size / 1024)} KB）`
}
