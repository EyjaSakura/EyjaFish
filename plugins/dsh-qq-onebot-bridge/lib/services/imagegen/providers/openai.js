// OpenAI 兼容的 /images/generations 适配器：智谱 CogView、SiliconFlow、OpenAI、302.ai 等。
import { ImageError, fromHttpError, sniffFormat, toImageError } from '../types.js'

export const type = 'openai'

export function validate(cfg) {
  if (!cfg.baseUrl) throw new ImageError('CONFIG', 'openai 适配器缺少 baseUrl', { fatal: true, provider: cfg.name })
  if (!cfg.model) throw new ImageError('CONFIG', 'openai 适配器缺少 model', { fatal: true, provider: cfg.name })
  if (!cfg.apiKey) throw new ImageError('CONFIG', 'openai 适配器缺少 apiKey', { fatal: true, provider: cfg.name })
}

export function buildRequest(cfg, req) {
  const body = {
    model: cfg.model,
    prompt: req.prompt,
    n: 1,
    size: req.size || cfg.size || '1024x1024',
    response_format: 'b64_json',
  }
  if (req.negativePrompt && cfg.supportsNegative) body.negative_prompt = req.negativePrompt
  if (req.seed !== null && req.seed !== undefined && cfg.supportsSeed) body.seed = req.seed
  return body
}

/** 把 b64 / url 两种响应统一成 buffer。 */
export async function parseResponse(cfg, data, timeoutMs) {
  const first = Array.isArray(data?.data) ? data.data[0] : null
  if (!first) throw new ImageError('EMPTY', '生图服务未返回图片数据', { provider: cfg.name })
  if (first.b64_json) {
    const buffer = Buffer.from(String(first.b64_json), 'base64')
    if (!buffer.length) throw new ImageError('EMPTY', '生图返回了空图片', { provider: cfg.name })
    return { buffer, format: sniffFormat(buffer) }
  }
  if (first.url) {
    const res = await fetch(String(first.url), { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) throw new ImageError('PROVIDER', `下载生成图片失败 HTTP ${res.status}`, { provider: cfg.name })
    const buffer = Buffer.from(await res.arrayBuffer())
    return { buffer, format: sniffFormat(buffer) }
  }
  throw new ImageError('EMPTY', '生图响应缺少图片内容', { provider: cfg.name })
}

export async function generate(req, cfg) {
  const timeoutMs = Math.max(10000, Number(req.timeoutMs) || 120000)
  const base = String(cfg.baseUrl).replace(/\/+$/, '')
  let res
  try {
    res = await fetch(`${base}/images/generations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRequest(cfg, req)),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    throw toImageError(cfg.name, error)
  }
  if (!res.ok) throw fromHttpError(cfg.name, res.status, await res.text().catch(() => ''))
  const data = await res.json().catch(() => null)
  return parseResponse(cfg, data, timeoutMs)
}
