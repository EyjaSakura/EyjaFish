// OCR 图片文字识别：收集候选图片 + 逐张识别。
// 下载与 OneBot 调用由调用方注入。

/** @param {any} args */
export function collectOcrCandidates({ replyMessage, images, isAbsolute, exists }) {
  const candidates = []
  for (const segment of (Array.isArray(replyMessage?.message) ? replyMessage.message : [])) {
    if (segment?.type !== 'image') continue
    const file = String(segment.data?.file ?? '')
    const url = String(segment.data?.url ?? '')
    if (file && isAbsolute(file) && exists(file)) candidates.push(file)
    else if (url) candidates.push(url)
  }
  for (const img of (Array.isArray(images) ? images : [])) {
    const file = String(img?.file ?? '')
    if (file && isAbsolute(file) && exists(file)) candidates.push(file)
    else if (img?.url) candidates.push(String(img.url))
  }
  return candidates
}

/** @param {any} args */
export async function ocrImages({ candidates, maxImages = 3, imageDir, socket, download, ocrImage, debugLog = () => {} }) {
  const limit = Math.max(1, Number(maxImages) || 3)
  const parts = []
  for (const [index, target] of (Array.isArray(candidates) ? candidates : []).slice(0, limit).entries()) {
    try {
      const local = /^https?:/i.test(target)
        ? await download(target, imageDir, `ocr-${Date.now().toString(36)}-${index}`)
        : target
      const data = await ocrImage(socket, local)
      const texts = Array.isArray(data?.texts)
        ? data.texts.map((item) => String(item?.text ?? '').trim()).filter((item) => item !== '')
        : (typeof data?.text === 'string' && data.text.trim() !== '' ? [data.text.trim()] : [])
      parts.push(texts.length > 0 ? texts.join('\n') : '（这张图没识别出文字）')
    } catch (error) {
      debugLog(`ocr image failed: ${error.message}`)
      parts.push(`（第 ${index + 1} 张识别失败：${error.message.slice(0, 60)}）`)
    }
  }
  return parts
}
