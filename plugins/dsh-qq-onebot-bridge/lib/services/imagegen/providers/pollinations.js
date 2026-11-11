// Pollinations：免费、无需 key，GET 直出图片。
import { ImageError, parseSize, sniffFormat, toImageError } from '../types.js'

export const type = 'pollinations'

export function validate(cfg) {
  if (!cfg.model) cfg.model = 'flux'
}

export function buildUrl(cfg, req) {
  const { width, height } = parseSize(req.size || cfg.size || '1024x1024')
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    nologo: 'true',
    ...(req.seed !== null && req.seed !== undefined ? { seed: String(req.seed) } : {}),
  })
  if (cfg.model) params.set('model', cfg.model)
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(req.prompt)}?${params.toString()}`
}

export async function generate(req, cfg) {
  const timeoutMs = Math.max(15000, Number(req.timeoutMs) || 120000)
  const url = buildUrl(cfg, req)
  let res
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (dsh-imagegen)' },
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    throw toImageError(cfg.name, error)
  }
  if (!res.ok) throw new ImageError('PROVIDER', `Pollinations HTTP ${res.status}`, { provider: cfg.name })
  const type = String(res.headers.get('content-type') || '')
  if (!/^image\//i.test(type)) {
    throw new ImageError('PROVIDER', `Pollinations 返回的不是图片：${type.slice(0, 40)}`, { provider: cfg.name })
  }
  const buffer = Buffer.from(await res.arrayBuffer())
  return { buffer, format: sniffFormat(buffer), meta: { url: String(url).slice(0, 300) } }
}
