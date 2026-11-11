// 把本地图片文件转成 DSH 原生 image blocks（最多 4 张）。
import { basename } from 'node:path'

/** @param {any} args */
export async function imageBlocksFor({ files, attachments, readFile, debugLog = () => {} }) {
  if (files.length === 0) return []
  if (!attachments || typeof attachments.saveImages !== 'function') {
    debugLog('native vision unavailable: attachments service not mounted')
    return []
  }
  try {
    const images = files.slice(0, 4).map((file) => {
      const buffer = readFile(file)
      const lower = file.toLowerCase()
      const mediaType = lower.endsWith('.png') ? 'image/png'
        : lower.endsWith('.gif') ? 'image/gif'
          : lower.endsWith('.webp') ? 'image/webp'
            : 'image/jpeg'
      return { data: buffer, mediaType, name: basename(file) }
    })
    const refs = await attachments.saveImages(images)
    return refs.map((attachment) => ({ type: 'image', attachment }))
  } catch (error) {
    debugLog(`native image attach failed: ${error.message}`)
    return []
  }
}
