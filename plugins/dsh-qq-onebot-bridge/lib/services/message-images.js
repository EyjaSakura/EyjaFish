// 入站图片：下载/复制到本地，可选原生 vision blocks，并生成给模型的文字说明。
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

/** @param {any} args */
export async function downloadMessageImages({
  message,
  imageDir,
  config = {},
  downloadTo,
  extractGifFrame,
  imageBlocksFor,
  debugLog = () => {},
  now = () => Date.now(),
}) {
  const lines = []
  const files = []
  const pending = (message.images ?? []).slice(0, 4)
  for (let i = 0; i < pending.length; i++) {
    const img = pending[i]
    const url = (img && typeof img === 'object') ? (img.url || img.path) : img
    if (url && /^https?:\/\//.test(url)) {
      try {
        const saved = await downloadTo(url, imageDir, `qq-img-${now().toString(36)}-${i}`)
        const vision = (await extractGifFrame(saved)) ?? saved
        lines.push(`- 图片已保存到：${vision}`)
        files.push(vision)
        debugLog(`message image saved: ${saved}${vision !== saved ? ` (frame: ${vision})` : ''}`)
      } catch (error) {
        debugLog(`message image download failed: ${error.message}`)
        lines.push(`- 1 张图片下载失败：${error.message.slice(0, 60)}`)
      }
    } else if (url && (String(url).startsWith('file://') || existsSync(String(url)))) {
      try {
        let src = String(url)
        if (src.startsWith('file://')) {
          src = decodeURIComponent(src.slice(7))
          if (/^\//.test(src)) src = src.slice(1)
        }
        if (!existsSync(src)) throw new Error('本地图片不存在')
        mkdirSync(imageDir, { recursive: true })
        const dest = join(imageDir, `msg-img-${now().toString(36)}-${i}.png`)
        copyFileSync(src, dest)
        const vision = (await extractGifFrame(dest)) ?? dest
        lines.push(`- 图片已保存到：${vision}`)
        files.push(vision)
        debugLog(`local message image copied: ${src} -> ${dest}`)
      } catch (error) {
        debugLog(`local message image failed: ${error.message}`)
        lines.push(`- 1 张图片读取失败：${error.message.slice(0, 60)}`)
      }
    } else {
      lines.push(img?.kind === 'mface'
        ? `- 用户发送了 1 个动画表情（${img.summary || '无图片链接，无法查看'}）`
        : '- 用户发送了 1 张图片（无图片链接，无法查看）')
    }
  }
  let blocks = []
  if (config.visionMode === 'native' && config.visionEnabled !== false && files.length > 0) {
    blocks = await imageBlocksFor(files)
  }
  return { note: lines.join('\n'), blocks }
}
