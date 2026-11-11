// Outbox：离线/限流时的待发消息持久化与补发
// 状态仍然挂在 bridge 实例上（bridge.outbox / bridge.memoryDir / bridge.server）
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export function outboxFile(bridge) {
  return join(bridge.memoryDir, '..', 'qq-outbox.json')
}

export function loadOutbox(bridge) {
  try {
    const v = JSON.parse(readFileSync(outboxFile(bridge), 'utf8'))
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export function saveOutbox(bridge) {
  try {
    writeFileSync(outboxFile(bridge), JSON.stringify(bridge.outbox ?? [], null, 2), 'utf8')
  } catch { /* ignore */ }
}

export function enqueueOutbox(bridge, key, route, text) {
  if (!route?.targetId || !text) return
  bridge.outbox ??= loadOutbox(bridge)
  bridge.outbox.push({
    key,
    messageType: route.messageType,
    targetId: String(route.targetId),
    text: String(text),
    ts: Date.now(),
  })
  if (bridge.outbox.length > 200) bridge.outbox = bridge.outbox.slice(-200)
  saveOutbox(bridge)
  bridge.debugLog('[outbox] queued for ' + key + ' (' + bridge.outbox.length + ' pending)')
}

/** 每 60 秒补发一次；仍受限流就留到下次。 */
export async function flushOutbox(bridge) {
  bridge.outbox ??= loadOutbox(bridge)
  if (bridge.outbox.length === 0) return
  const socket = bridge.server.currentSocket()
  if (!socket) {
    bridge.debugLog('[outbox] skip: no socket (' + bridge.outbox.length + ' pending)')
    return
  }
  const keep = []
  for (const item of bridge.outbox) {
    if (Date.now() - item.ts > 6 * 60 * 60 * 1000) {
      bridge.debugLog('[outbox] expired ' + item.key)
      continue
    }
    if (bridge.rateLimited(item.key)) {
      keep.push(item)
      continue
    }
    try {
      await bridge.server.action(
        socket,
        item.messageType === 'group' ? 'send_group_msg' : 'send_private_msg',
        item.messageType === 'group'
          ? { group_id: Number(item.targetId), message: [{ type: 'text', data: { text: item.text } }] }
          : { user_id: Number(item.targetId), message: [{ type: 'text', data: { text: item.text } }] },
      )
      bridge.debugLog('[outbox] delivered ' + item.key)
    } catch (error) {
      bridge.debugLog('[outbox] send failed: ' + error.message)
      keep.push(item)
    }
  }
  bridge.outbox = keep
  saveOutbox(bridge)
}
