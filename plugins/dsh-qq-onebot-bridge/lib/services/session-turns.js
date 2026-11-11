// 会话轮换计数：每个 chatKey 记录真人回合数，到阈值后丢绑定开新会话。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

export function createSessionTurnsStore({ file, now = Date.now }) {
  function read() {
    try {
      if (!existsSync(file)) return {}
      return JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) || {}
    } catch {
      return {}
    }
  }

  function write(data) {
    writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
  }

  /**
   * 记一轮真人消息。
   * @returns {{ rotate: boolean, turns: number, oldId: string }}
   */
  function count({ key, sessionId = '', turnActive = false, max = 60 }) {
    const data = read()
    const prev = data[key] && typeof data[key] === 'object' ? data[key] : {}
    let turns = Number(prev.turns) || 0
    // 已经换过会话就重新数
    if (prev.sessionId && sessionId && String(prev.sessionId) !== sessionId) turns = 0
    turns += 1
    const oldId = String(prev.sessionId || sessionId || '')
    data[key] = { turns, sessionId: sessionId || oldId, updatedAt: now() }
    const rotate = turns >= max && turnActive !== true
    if (rotate) data[key] = { turns: 0, sessionId: '', updatedAt: now() }
    write(data)
    return { rotate, turns, oldId }
  }

  function reset(key) {
    const data = read()
    data[key] = { turns: 0, sessionId: '', updatedAt: now() }
    write(data)
  }

  return { read, write, count, reset }
}
