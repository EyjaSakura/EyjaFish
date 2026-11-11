// 会话注册表：把 bridge 里散落的 sessions Map 收成一个有语义的组件。
// 保持 Map 兼容接口，调用方可以逐步迁移，不需要一次性改所有引用。

export class SessionRegistry {
  constructor() {
    this.map = new Map()
  }

  get size() { return this.map.size }

  get(key) { return this.map.get(key) }
  set(key, value) { this.map.set(key, value); return value }
  has(key) { return this.map.has(key) }
  delete(key) { return this.map.delete(key) }
  clear() { this.map.clear() }

  keys() { return this.map.keys() }
  values() { return this.map.values() }
  entries() { return this.map.entries() }
  [Symbol.iterator]() { return this.map[Symbol.iterator]() }

  /** 找出第一个满足条件的会话，返回 [key, entry] 或 null。 */
  find(predicate) {
    for (const [key, entry] of this.map) {
      if (predicate(entry, key)) return [key, entry]
    }
    return null
  }

  /** 按条件过滤，返回 [key, entry] 列表。 */
  filter(predicate) {
    const out = []
    for (const [key, entry] of this.map) {
      if (predicate(entry, key)) out.push([key, entry])
    }
    return out
  }
}
