// 百炼 DashScope 文生图适配器（Wan2.1 / Qwen-Image）：异步任务 + 轮询。
import { ImageError, formatSize, fromHttpError, sniffFormat, toImageError } from '../types.js'

export const type = 'dashscope'

export function validate(cfg) {
  if (!cfg.baseUrl) throw new ImageError('CONFIG', 'dashscope 适配器缺少 baseUrl', { fatal: true, provider: cfg.name })
  if (!cfg.model) throw new ImageError('CONFIG', 'dashscope 适配器缺少 model', { fatal: true, provider: cfg.name })
  if (!cfg.apiKey) throw new ImageError('CONFIG', 'dashscope 适配器缺少 apiKey', { fatal: true, provider: cfg.name })
}

export function buildRequest(cfg, req) {
  return {
    model: cfg.model,
    input: {
      prompt: req.prompt,
      ...(req.negativePrompt ? { negative_prompt: req.negativePrompt } : {}),
    },
    parameters: {
      size: formatSize(req.size || cfg.size || '1024x1024', '*'),
      n: 1,
      ...(req.seed !== null && req.seed !== undefined ? { seed: req.seed } : {}),
    },
  }
}

async function fetchTask(cfg, taskId, timeoutMs) {
  const base = String(cfg.baseUrl).replace(/\/+$/, '')
  const res = await fetch(`${base}/api/v1/tasks/${taskId}`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    signal: AbortSignal.timeout(Math.min(30000, timeoutMs)),
  })
  if (!res.ok) throw fromHttpError(cfg.name, res.status, await res.text().catch(() => ''))
  return res.json()
}

export async function generate(req, cfg) {
  const timeoutMs = Math.max(15000, Number(req.timeoutMs) || 180000)
  const base = String(cfg.baseUrl).replace(/\/+$/, '')
  let submitted
  try {
    const res = await fetch(`${base}/api/v1/services/aigc/text2image/image-synthesis`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify(buildRequest(cfg, req)),
      signal: AbortSignal.timeout(60000),
    })
    if (!res.ok) throw fromHttpError(cfg.name, res.status, await res.text().catch(() => ''))
    submitted = await res.json()
  } catch (error) {
    throw toImageError(cfg.name, error)
  }
  const taskId = submitted?.output?.task_id
  if (!taskId) throw new ImageError('PROVIDER', '百炼未返回 task_id', { provider: cfg.name })

  const deadline = Date.now() + timeoutMs
  const sleep = cfg.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)))
  while (Date.now() < deadline) {
    await sleep(Math.max(1000, Number(cfg.pollIntervalMs) || 3000))
    let state
    try {
      state = await fetchTask(cfg, taskId, timeoutMs)
    } catch (error) {
      throw toImageError(cfg.name, error)
    }
    const status = state?.output?.task_status
    if (status === 'SUCCEEDED') {
      const url = state?.output?.results?.[0]?.url
      if (!url) throw new ImageError('EMPTY', '百炼任务成功但没有图片 URL', { provider: cfg.name })
      const img = await fetch(url, { signal: AbortSignal.timeout(60000) })
      if (!img.ok) throw new ImageError('PROVIDER', `下载百炼图片失败 HTTP ${img.status}`, { provider: cfg.name })
      const buffer = Buffer.from(await img.arrayBuffer())
      return { buffer, format: sniffFormat(buffer), meta: { taskId, url } }
    }
    if (status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN') {
      const msg = state?.output?.message || JSON.stringify(state?.output || {}).slice(0, 200)
      throw new ImageError('PROVIDER', `百炼任务失败：${msg}`, { provider: cfg.name })
    }
  }
  throw new ImageError('TIMEOUT', '百炼任务超时（可能仍在排队）', { provider: cfg.name })
}
