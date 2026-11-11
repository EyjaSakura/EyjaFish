// 下载远程图片到本地目录。
import { mkdirSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'

export function guessImageExt(contentType, url) {
  if (typeof contentType === 'string') {
    if (contentType.includes('gif')) return '.gif'
    if (contentType.includes('jpeg') || contentType.includes('jpg')) return '.jpg'
    if (contentType.includes('webp')) return '.webp'
    if (contentType.includes('png')) return '.png'
  }
  const ext = extname(String(url).split('?')[0])
  return ext || '.png'
}

export async function downloadTo(url, directory, name, fetchImpl = fetch) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error(`download HTTP ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length === 0) throw new Error('download empty')
  mkdirSync(directory, { recursive: true })
  const ext = guessImageExt(response.headers.get('content-type'), url)
  const filePath = join(directory, `${name}${ext}`)
  writeFileSync(filePath, buffer)
  return filePath
}
