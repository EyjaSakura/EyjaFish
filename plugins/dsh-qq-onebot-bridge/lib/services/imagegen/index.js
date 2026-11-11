// 多 provider 生图入口：配置选平台、失败自动 fallback、缓存、成本记账。
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import * as openai from './providers/openai.js'
import * as dashscope from './providers/dashscope.js'
import * as pollinations from './providers/pollinations.js'
import * as localSd from './providers/local-sd.js'
import { cacheGet, cacheKey, cachePut } from './cache.js'
import { estimateCost } from './cost.js'
import { ImageError, toImageError } from './types.js'

const CONFIG_FILE = 'D:\\DSH\\qqbot\\data\\imagegen.json'
const USAGE_FILE = 'D:\\DSH\\qqbot\\data\\image-usage.jsonl'
const ADAPTERS = { openai, dashscope, pollinations, local: localSd }

let cached = { mtime: 0, value: null }

/** 读配置文件；没有就退回旧的扁平配置，保证老部署还能用。 */
export function loadConfig(bridgeConfig = {}) {
  try {
    if (existsSync(CONFIG_FILE)) {
      const mtime = Number(statSync(CONFIG_FILE).mtimeMs)
      if (cached.value && cached.mtime === mtime) return cached.value
      const parsed = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'))
      cached = { mtime, value: parsed }
      return parsed
    }
  } catch (error) {
    throw new ImageError('CONFIG', `生图配置读取失败：${error.message}`, { fatal: true })
  }
  // 兼容旧配置：imageGenBaseUrl / imageGenApiKey / imageGenModel
  const legacy = {
    provider: 'legacy',
    fallback: [],
    cache: false,
    providers: {
      legacy: {
        type: bridgeConfig.imageGenProvider === 'local' ? 'local' : 'openai',
        baseUrl: bridgeConfig.imageGenBaseUrl || (bridgeConfig.imageGenProvider === 'local' ? 'http://127.0.0.1:7860' : 'https://api.openai.com/v1'),
        apiKey: bridgeConfig.imageGenApiKey || '',
        model: bridgeConfig.imageGenModel || 'gpt-image-1',
        size: bridgeConfig.imageGenSize || '1024x1024',
      },
    },
  }
  cached = { mtime: 0, value: legacy }
  return legacy
}

/** 解析 provider 的 key：直接给、或从 keyFile/keyName 读。 */
export function resolveKey(cfg = {}) {
  if (cfg.apiKey) return String(cfg.apiKey)
  if (!cfg.keyFile) return ''
  try {
    const keys = JSON.parse(readFileSync(cfg.keyFile, 'utf8'))
    return String(keys[cfg.keyName || 'qwen'] || '')
  } catch {
    return ''
  }
}

function prepare(name, raw, adapters = ADAPTERS) {
  const type = raw.type || 'openai'
  const adapter = adapters[type]
  if (!adapter) throw new ImageError('CONFIG', `未知的生图类型：${type}`, { fatal: true, provider: name })
  const cfg = { ...raw, name, type, apiKey: resolveKey(raw) }
  adapter.validate?.(cfg)
  return { name, cfg, adapter }
}

function logUsageFn(entry) {
  try {
    mkdirSync(dirname(USAGE_FILE), { recursive: true })
    appendFileSync(USAGE_FILE, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n', 'utf8')
  } catch { /* 记账失败不影响出图 */ }
}

/**
 * 画一张图。
 * @param {object} bridgeConfig 老配置（兼容用）
 * @param {string} prompt
 * @param {{ provider?: string, size?: string, seed?: number, negativePrompt?: string, timeoutMs?: number, noCache?: boolean, deps?: any }} [opts]
 * @returns {Promise<{buffer: Buffer, format: string, provider: string, model: string, watermark: boolean, cost: number|null, cached: boolean}>}
 */
export async function generateImage(bridgeConfig, prompt, opts = {}) {
  const deps = opts.deps || {}
  const text = String(prompt ?? '').trim()
  if (!text) throw new ImageError('CONFIG', '提示词不能为空', { fatal: true })
  const config = deps.config || (deps.loadConfig || loadConfig)(bridgeConfig)
  const adapters = deps.adapters || ADAPTERS
  const cache = {
    key: deps.cache?.key || cacheKey,
    get: deps.cache?.get || cacheGet,
    put: deps.cache?.put || cachePut,
  }
  const logUsage = deps.logUsage || logUsageFn
  const costOf = deps.estimateCost || estimateCost
  const names = [opts.provider || config.provider, ...(config.fallback || [])].filter(Boolean)
  if (names.length === 0) throw new ImageError('CONFIG', '没有配置任何生图 provider', { fatal: true })

  const req = {
    prompt: text,
    size: opts.size || config.size || '1024x1024',
    seed: opts.seed ?? null,
    negativePrompt: opts.negativePrompt || '',
    timeoutMs: opts.timeoutMs,
  }

  let lastError = null
  for (const name of names) {
    const raw = config.providers?.[name]
    if (!raw) continue
    let prepared
    try {
      prepared = prepare(name, raw, adapters)
    } catch (error) {
      lastError = error
      if (error.fatal) throw error
      continue
    }
    const { cfg, adapter } = prepared
    const key = cache.key({ provider: name, model: cfg.model, prompt: text, size: req.size, seed: req.seed })
    if (config.cache !== false && opts.noCache !== true) {
      const hit = cache.get(key)
      if (hit) {
        logUsage({ provider: name, model: cfg.model, cost: 0, cached: true, ok: true })
        return { buffer: hit.buffer, format: hit.format, provider: name, model: cfg.model, watermark: !!cfg.watermark, cost: 0, cached: true }
      }
    }
    const started = Date.now()
    try {
      const result = await adapter.generate(req, cfg)
      if (!result?.buffer?.length) throw new ImageError('EMPTY', `${name} 返回空图片`, { provider: name })
      const cost = costOf(cfg.model, cfg)
      if (config.cache !== false) cache.put(key, result.buffer, result.format)
      logUsage({ provider: name, model: cfg.model, cost, ok: true, ms: Date.now() - started, watermark: !!cfg.watermark })
      return {
        buffer: result.buffer,
        format: result.format || 'png',
        provider: name,
        model: cfg.model,
        watermark: !!cfg.watermark,
        cost,
        cached: false,
      }
    } catch (error) {
      const err = toImageError(name, error)
      lastError = err
      logUsage({ provider: name, model: cfg.model, ok: false, error: err.code, message: err.message.slice(0, 160), ms: Date.now() - started })
      if (err.fatal) throw err
    }
  }
  throw lastError || new ImageError('PROVIDER', '所有生图 provider 都失败了', { fatal: true })
}

/** 只读：列出已配置的 provider，给面板/自检用。 */
export function listProviders(bridgeConfig = {}) {
  try {
    const config = loadConfig(bridgeConfig)
    return Object.entries(config.providers || {}).map(([name, cfg]) => ({
      name, type: cfg.type || 'openai', model: cfg.model || '', watermark: !!cfg.watermark, active: name === config.provider,
    }))
  } catch {
    return []
  }
}

export { CONFIG_FILE, USAGE_FILE }
