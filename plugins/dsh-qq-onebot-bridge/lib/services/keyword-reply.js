// 关键词自动回复（文本 + 图片）。
import { existsSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

/** @param {any} args */
export async function handleKeyword({
  message,
  text,
  keywordStore,
  routeKey,
  recordMemory,
  safeReply,
  keywordImage,
  sendImage,
  routeOf,
  debugLog = () => {},
}) {
  const t = String(text ?? '').trim()
  if (t === '') return false
  const key = routeKey(message)
  let hit = null
  try {
    hit = keywordStore.match(t, { chatKey: key, isGroup: message.messageType === 'group' })
  } catch (error) {
    debugLog(`keyword match failed: ${error.message}`)
    return false
  }
  if (!hit) return false
  if (hit.reply) {
    recordMemory(key, 'user', t)
    await safeReply(message, hit.reply)
    recordMemory(key, 'assistant', hit.reply)
  }
  if (hit.image) {
    try {
      const file = await keywordImage(hit.image)
      if (file) await sendImage(routeOf(message), file)
    } catch (error) {
      debugLog(`keyword image failed: ${error.message}`)
    }
  }
  debugLog(`keyword hit trigger=${hit.trigger}`)
  return Boolean(hit.reply || hit.image)
}

/** @param {any} args */
export async function keywordImage({
  image,
  imageDir,
  cwd = process.cwd(),
  downloadTo,
  exists = existsSync,
  now = Date.now(),
}) {
  const value = String(image ?? '').trim()
  if (!value) return ''
  if (/^https?:\/\//.test(value)) {
    return downloadTo(value, imageDir, `kw-${now.toString(36)}`)
  }
  const abs = isAbsolute(value) ? value : join(cwd, value)
  if (!exists(abs)) throw new Error(`图片不存在：${abs}`)
  return abs
}
