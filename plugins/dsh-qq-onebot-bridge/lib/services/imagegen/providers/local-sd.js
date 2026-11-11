// 本地 Stable Diffusion WebUI（AUTOMATIC1111 兼容）适配器。
import { ImageError, parseSize, sniffFormat } from '../types.js'

export const type = 'local'

export function validate(cfg) {
  if (!cfg.baseUrl) throw new ImageError('CONFIG', 'local 适配器缺少 baseUrl', { fatal: true, provider: cfg.name })
}

export function buildRequest(cfg, req) {
  const { width, height } = parseSize(req.size || cfg.size || '512x512')
  return {
    prompt: req.prompt,
    negative_prompt: req.negativePrompt || cfg.negativePrompt || '',
    steps: Math.max(1, Math.min(100, Number(cfg.steps) || 20)),
    cfg_scale: Math.max(1, Math.min(30, Number(cfg.cfgScale) || 7)),
    sampler_name: cfg.sampler || '',
    width,
    height,
  }
}

export async function generate(req, cfg) {
  const timeoutMs = Math.max(30000, Number(req.timeoutMs) || 180000)
  const base = String(cfg.baseUrl).replace(/\/+$/, '')
  let res
  try {
    res = await fetch(`${base}/sdapi/v1/txt2img`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRequest(cfg, req)),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    throw new ImageError('TIMEOUT', `本地 SD 请求失败：${String(error.message).slice(0, 120)}`, { provider: cfg.name })
  }
  if (!res.ok) throw new ImageError('PROVIDER', `本地 SD HTTP ${res.status}`, { provider: cfg.name })
  const data = await res.json().catch(() => null)
  const b64 = Array.isArray(data?.images) ? data.images[0] : null
  if (!b64) throw new ImageError('EMPTY', '本地 SD 未返回图片', { provider: cfg.name })
  const buffer = Buffer.from(String(b64), 'base64')
  return { buffer, format: sniffFormat(buffer) }
}
