// Deferred：机器人离线/忙时把入站消息排队，恢复后按 key 补处理
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export function deferredFile(bridge) {
  return join(bridge.memoryDir, '..', 'qq-deferred-messages.json')
}

export function loadDeferred(bridge) {
  try {
    const v = JSON.parse(readFileSync(deferredFile(bridge), 'utf8'))
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

export function saveDeferred(bridge, store) {
  try {
    writeFileSync(deferredFile(bridge), JSON.stringify(store, null, 2), 'utf8')
  } catch (error) {
    bridge.debugLog('[inject-queue] persist failed: ' + error.message)
  }
}

export function queueUserMessage(bridge, key, message) {
  const store = loadDeferred(bridge)
  const arr = store[key] ?? []
  if (arr.length >= 20) {
    bridge.debugLog('[inject-queue] queue full, dropped for ' + key)
    return
  }
  arr.push({
    at: Date.now(),
    msg: {
      userId: message.userId, groupId: message.groupId ?? null, messageType: message.messageType,
      messageId: message.messageId, text: message.text ?? '', raw: message.raw ?? null,
      ats: message.ats ?? [], reply: message.reply ?? null, records: message.records ?? [],
      images: message.images ?? [], files: message.files ?? [], forwards: message.forwards ?? [],
      forwardText: message.forwardText ?? '',
    },
  })
  store[key] = arr
  saveDeferred(bridge, store)
}

export async function flushDeferred(bridge, key) {
  const store = loadDeferred(bridge)
  const arr = store[key] ?? []
  if (arr.length === 0) return
  delete store[key]
  saveDeferred(bridge, store)
  const socket = bridge.server.currentSocket()
  if (!socket) {
    const again = loadDeferred(bridge)
    again[key] = [...(again[key] ?? []), ...arr]
    saveDeferred(bridge, again)
    bridge.debugLog('[inject-queue] no socket, kept ' + arr.length + ' queued')
    return
  }
  bridge.debugLog('[inject-queue] flushing ' + arr.length + ' queued message(s) for ' + key)
  for (const item of arr) {
    if (Date.now() - item.at > 30 * 60_000) {
      bridge.debugLog('[inject-queue] dropped stale queued message')
      continue
    }
    setTimeout(() => {
      void bridge.onQqMessage({ ...item.msg, bot: bridge.server.currentSocket(), __queued: true })
        .catch((e) => bridge.debugLog('[inject-queue] flush failed: ' + e.message))
    }, 300)
  }
}

export function flushAllDeferred(bridge) {
  for (const key of Object.keys(loadDeferred(bridge))) void flushDeferred(bridge, key)
}
