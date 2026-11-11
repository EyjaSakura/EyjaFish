// 解析被引用的消息：文字、图片下载/vision、语音转写，返回给模型的 lines/blocks。
/** @param {any} args */
export async function resolveQuoted({
  message,
  config = {},
  server,
  quoteDir,
  stickerMsgMap,
  setQuoteState,
  extractQuoteParts,
  downloadTo,
  extractGifFrame,
  imageBlocksFor,
  fetchVoiceAudio,
  transcribe,
  debugLog = () => {},
  now = () => Date.now(),
}) {
  const full = await server.getMsg(message.bot, message.reply.messageId)
  const segments = Array.isArray(full?.message) ? full.message : []
  const { texts, images, records } = extractQuoteParts(segments)
  if (images.length > 0) setQuoteState({ images: images.slice(0, 3), at: now(), stickerName: undefined })
  setQuoteState({ stickerName: stickerMsgMap?.get(String(message.reply?.messageId)) || '' })
  const textPart = texts.length > 0 ? texts.join('') : ''
  const lines = []
  const blocks = []
  let hasVoice = false
  if (textPart) lines.push(`用户引用的消息内容：${textPart}`)
  const nativeVision = config.visionMode === 'native' && config.visionEnabled !== false
  const downloaded = []
  for (let i = 0; i < images.length; i++) {
    try {
      const saved = await downloadTo(images[i], quoteDir, `quoted-${now().toString(36)}-${i}`)
      const vision = (await extractGifFrame(saved)) ?? saved
      if (nativeVision) downloaded.push(vision)
      else lines.push(`用户引用的图片已保存到：${vision}（可用 ${config.visionToolName} 查看它）`)
    } catch (error) {
      debugLog(`quote image download failed: ${error.message}`)
      lines.push('用户引用了 1 张图片（下载失败）')
    }
  }
  if (downloaded.length > 0) {
    blocks.push(...await imageBlocksFor(downloaded))
    lines.push(blocks.length > 0 ? `用户引用了 ${downloaded.length} 张图片（已附在本条消息中）` : `用户引用了 ${downloaded.length} 张图片（附件不可用，图片已存本地）`)
  }
  if (records.length > 0) {
    hasVoice = true
    if (config.sttEnabled) {
      try {
        const audio = await fetchVoiceAudio(message, records[0])
        const transcript = await transcribe(audio)
        lines.push(`用户引用的语音转文字内容：${transcript}`)
        debugLog(`quoted voice transcribed (${transcript.length} chars)`)
      } catch (error) {
        debugLog(`quoted voice STT failed: ${error.message}`)
        lines.push(`用户引用了 1 条语音（转文字失败：${error.message.slice(0, 80)}）`)
      }
    } else {
      lines.push('用户引用了 1 条语音（未开启语音转文字）')
    }
  }
  return { lines, hasVoice, blocks }
}
