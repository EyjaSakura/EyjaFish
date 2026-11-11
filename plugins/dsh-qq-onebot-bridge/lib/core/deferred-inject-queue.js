// 注入推迟队列：会话忙时把注入暂存，空闲后按顺序投递。
// 纯状态机，isBusy/dispatch 由调用方注入，便于单测。

export class DeferredInjectQueue {
  constructor(options = {}) {
    this.max = Math.max(1, Number(options.max) || 8)
    this.ttlMs = Math.max(1000, Number(options.ttlMs) || 5 * 60_000)
    this.items = []
  }

  get size() { return this.items.length }

  /** @returns {boolean} 是否入队；队列满时返回 false。 */
  push(item) {
    if (this.items.length >= this.max) return false
    this.items.push({
      kind: item.kind,
      frame: item.frame,
      chatKey: item.chatKey,
      at: Number.isFinite(Number(item.at)) ? Number(item.at) : Date.now(),
    })
    return true
  }

  /**
   * 清掉过期项，投递已空闲项，保留仍在忙的项。
   * @param {{ now?: number, isBusy?: (item) => boolean, dispatch?: (item) => Promise<void> }} opts
   * @returns {Promise<{ dispatched: number, expired: number, pending: number }>}
   */
  async drain(opts = {}) {
    const now = Number(opts.now) || Date.now()
    const isBusy = opts.isBusy || (() => false)
    const dispatch = opts.dispatch || (async () => {})
    const ready = []
    const keep = []
    let expired = 0
    for (const item of this.items) {
      if (now - item.at > this.ttlMs) { expired += 1; continue }
      if (isBusy(item)) { keep.push(item); continue }
      ready.push(item)
    }
    this.items = keep
    for (const item of ready) await dispatch(item)
    return { dispatched: ready.length, expired, pending: keep.length }
  }

  clear() { this.items = [] }
}
