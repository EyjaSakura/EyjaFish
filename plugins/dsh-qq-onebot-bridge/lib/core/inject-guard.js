// 系统注入的去重与限流闸门。
// 只拦系统注入；真人消息不经过这里。
import { createHash } from 'node:crypto'

export class InjectGuard {
  constructor(options = {}) {
    this.duplicateWindowMs = Number(options.duplicateWindowMs) || 10 * 60_000
    this.rateWindowMs = Number(options.rateWindowMs) || 60_000
    this.maxPerWindow = Number(options.maxPerWindow) || 3
    this.seen = new Map()
    this.recent = []
    this.now = options.now || (() => Date.now())
  }

  /**
   * @returns {'' | 'duplicate' | 'rate-limited'}
   */
  check(kind, frame) {
    const now = this.now()
    for (const [k, at] of this.seen) if (now - at > this.duplicateWindowMs) this.seen.delete(k)
    this.recent = this.recent.filter((at) => now - at < this.rateWindowMs)

    const text = String(frame?.text ?? '').trim()
    if (text !== '') {
      const hash = createHash('sha1')
        .update(kind + '|' + String(frame?.groupId ?? frame?.userId ?? '') + '|' + text)
        .digest('hex')
      if (this.seen.has(hash)) return 'duplicate'
      if (this.recent.length >= this.maxPerWindow) return 'rate-limited'
      this.seen.set(hash, now)
    }
    this.recent.push(now)
    return ''
  }
}
