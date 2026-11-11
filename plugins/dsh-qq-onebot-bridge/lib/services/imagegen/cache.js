// 生图缓存：同 prompt + 参数不重复花钱。
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const CACHE_DIR = 'D:\\DSH\\qqbot\\data\\image-cache'
const EXTS = ['png', 'jpg', 'webp', 'gif']

export function cacheKey({ provider, model, prompt, size, seed }) {
  return createHash('sha256')
    .update([provider, model, String(prompt || '').trim(), size || '', seed ?? ''].join('|'))
    .digest('hex')
    .slice(0, 40)
}

export function cacheGet(key, dir = CACHE_DIR) {
  for (const ext of EXTS) {
    const file = join(dir, `${key}.${ext}`)
    if (!existsSync(file)) continue
    try {
      const buffer = readFileSync(file)
      if (buffer.length) return { buffer, format: ext === 'jpg' ? 'jpeg' : ext, file }
    } catch { /* 读不了就当没缓存 */ }
  }
  return null
}

export function cachePut(key, buffer, format = 'png', dir = CACHE_DIR) {
  try {
    mkdirSync(dir, { recursive: true })
    const ext = format === 'jpeg' ? 'jpg' : (format || 'png')
    const file = join(dir, `${key}.${ext}`)
    writeFileSync(file, buffer)
    return file
  } catch {
    return ''
  }
}
