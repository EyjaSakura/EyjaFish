// /ocr 命令：收集引用/直发图片候选，逐张识别并回复。
/** @param {any} args */
export async function handleOcrCommand({
  message,
  text,
  config = {},
  canRun,
  server,
  safeReply,
  collectOcrCandidates,
  ocrImages,
  downloadTo,
  imageDir,
  isAbsolute,
  existsSync,
  debugLog = () => {},
}) {
  if (config.ocrEnabled === false) return false
  if (!canRun(message, 'cmd.ocr').allowed) return false
  if (!/^[\/／](?:ocr|OCR|识图|识字|读图)$/.test(String(text ?? '').trim())) return false
  if (message.__injected === true || message.__replayed === true) {
    await safeReply(message, '（回放/注入模式不访问 QQ，跳过图片文字识别）')
    return true
  }
  const socket = server.currentSocket()
  if (!socket) {
    await safeReply(message, '⚠️ 当前无可用连接，稍后再试。')
    return true
  }
  let replyMessage = null
  if (message.reply?.messageId) {
    try {
      replyMessage = await server.getMsg(message.bot, message.reply.messageId)
    } catch (error) {
      debugLog(`ocr quote resolve failed: ${error.message}`)
    }
  }
  const candidates = collectOcrCandidates({
    replyMessage,
    images: message.images,
    isAbsolute,
    exists: existsSync,
  })
  if (candidates.length === 0) {
    await safeReply(message, '用法：@我 并引用一张图片发 /ocr，或直接发图片时带上 /ocr')
    return true
  }
  const parts = await ocrImages({
    candidates,
    maxImages: config.ocrMaxImages,
    imageDir,
    socket,
    download: downloadTo,
    ocrImage: (sock, file) => server.ocrImage(sock, file),
    debugLog,
  })
  await safeReply(message, `🔍 图片文字识别：\n${parts.join('\n---\n')}`)
  return true
}
