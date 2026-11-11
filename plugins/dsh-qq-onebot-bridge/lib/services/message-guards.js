// 出站限流与入站去重：独立状态机，便于单测。

export class RateLimiter {
  /** @param {{ config?: any, now?: () => number }} [args] */
  constructor({ config = {}, now = () => Date.now() } = {}) {
    this.config = config
    this.now = now
    this.replyTimes = new Map()
  }

  limited(key) {
    if (!this.config.rateLimitEnabled) return false
    const now = this.now()
    const windowMs = Math.max(5, Number(this.config.rateLimitWindowSeconds) || 60) * 1000
    const max = Math.max(1, Number(this.config.rateLimitMaxReplies) || 10)
    const times = (this.replyTimes.get(key) ?? []).filter((t) => now - t < windowMs)
    if (times.length >= max) {
      this.replyTimes.set(key, times)
      return true
    }
    times.push(now)
    this.replyTimes.set(key, times)
    if (this.replyTimes.size > 500) {
      for (const [k, list] of this.replyTimes) {
        const kept = list.filter((t) => now - t < windowMs)
        if (kept.length === 0) this.replyTimes.delete(k)
        else this.replyTimes.set(k, kept)
      }
    }
    return false
  }
}

export class DuplicateGuard {
  /** @param {{ config?: any, now?: () => number }} [args] */
  constructor({ config = {}, now = () => Date.now() } = {}) {
    this.config = config
    this.now = now
    this.seen = new Map()
  }

  isDuplicate(message) {
    if (/^(greet|activity|an-done|douyin|inj|heartbeat)/.test(String(message.messageId || ''))) return false
    if (!this.config.dedupEnabled) return false
    const id = message.messageId
    if (id === undefined || id === null) return false
    const now = this.now()
    const windowMs = Math.max(10, Number(this.config.dedupWindowSeconds) || 300) * 1000
    if (this.seen.size > 1000) {
      for (const [mid, ts] of this.seen) {
        if (now - ts > windowMs) this.seen.delete(mid)
      }
    }
    const seen = this.seen.get(id)
    this.seen.set(id, now)
    return seen !== undefined && now - seen < windowMs
  }
}
