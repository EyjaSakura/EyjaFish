// 图像生成的统一类型：错误、尺寸、格式嗅探。
// 所有 provider 返回同一种结果，上层不关心平台差异。

export class ImageError extends Error {
  /**
   * @param {string} code  AUTH | CONFIG | POLICY | RATE | TIMEOUT | PROVIDER | EMPTY
   * @param {string} message
   * @param {{ fatal?: boolean, provider?: string, status?: number }} [opts]
   */
  constructor(code, message, opts = {}) {
    super(message)
    this.name = 'ImageError'
    this.code = code
    // fatal = 换平台也没用（配置错、鉴权错）；非 fatal 才尝试 fallback
    this.fatal = opts.fatal === true
    this.provider = opts.provider || ''
    this.status = opts.status || 0
  }
}

/** 从二进制头判断真实图片格式，避免扩展名骗人。 */
export function sniffFormat(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return 'png'
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'jpeg'
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'png'
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  if (buffer.toString('ascii', 0, 3) === 'GIF') return 'gif'
  return 'png'
}

/** "1024x1024" / "1024*1024" / "1024×1024" -> { width, height } */
export function parseSize(size) {
  const m = String(size || '').match(/(\d+)\s*[x*×]\s*(\d+)/i)
  if (!m) return { width: 1024, height: 1024 }
  return { width: Math.max(64, Number(m[1]) || 1024), height: Math.max(64, Number(m[2]) || 1024) }
}

/** 按平台分隔符输出尺寸字符串。 */
export function formatSize(size, sep = 'x') {
  const { width, height } = parseSize(size)
  return `${width}${sep}${height}`
}

/** 统一把 HTTP/接口错误翻译成 ImageError。 */
export function fromHttpError(provider, status, text) {
  const body = String(text || '').slice(0, 300)
  if (status === 401 || status === 403) {
    return new ImageError('AUTH', `${provider} 鉴权失败（HTTP ${status}）：${body}`, { fatal: true, provider, status })
  }
  if (/inspection|sensitive|policy|content|审核|敏感|违规/i.test(body)) {
    return new ImageError('POLICY', `${provider} 拒绝了这次内容：${body}`, { fatal: true, provider, status })
  }
  if (status === 429) return new ImageError('RATE', `${provider} 限流（HTTP 429）：${body}`, { provider, status })
  if (status >= 500) return new ImageError('PROVIDER', `${provider} 服务端错误（HTTP ${status}）：${body}`, { provider, status })
  return new ImageError('PROVIDER', `${provider} HTTP ${status}：${body}`, { provider, status })
}

/** 统一把异常包成 ImageError（保留原码）。 */
export function toImageError(provider, error) {
  if (error instanceof ImageError) return error
  const message = String(error?.message ?? error)
  if (/timeout|aborted|timed out/i.test(message)) {
    return new ImageError('TIMEOUT', `${provider} 超时：${message.slice(0, 120)}`, { provider })
  }
  return new ImageError('PROVIDER', `${provider} 失败：${message.slice(0, 200)}`, { provider })
}
