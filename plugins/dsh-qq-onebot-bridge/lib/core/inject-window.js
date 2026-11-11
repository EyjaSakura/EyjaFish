// 注入同步窗口：dry-run 派发期间，按 chatKey 暂时屏蔽出站。
export class InjectWindowRegistry {
  constructor(options = {}) {
    this.ttlMs = Math.max(1000, Number(options.ttlMs) || 60_000)
    this.now = options.now || (() => Date.now())
    this.map = new Map()
  }

  begin(chatKey) {
    if (!chatKey) return
    this.map.set(chatKey, this.now() + this.ttlMs)
  }

  end(chatKey) {
    if (!chatKey) return
    this.map.delete(chatKey)
  }

  active(chatKey) {
    if (!chatKey) return false
    const until = this.map.get(chatKey)
    return Number.isFinite(until) && this.now() < until
  }

  clear() { this.map.clear() }
}
