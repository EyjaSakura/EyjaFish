// /new rotation and recall-cache bookkeeping.
import { debugLog } from '../core/debug-log.js'

export async function disposeSessionForBridge({ bridge, key }) {
  const entry = bridge.sessions.get(key)
  if (entry === undefined) return
  bridge.sessions.delete(key)
  bridge.agents.delete(entry.sessionId)
  entry.handle.agent.cancel({ kind: 'user' })
  await entry.handle.dispose()
}

export async function rotateChat({ bridge, message }) {
  const key = bridge.routeKey(message)
  const binding = bridge.workspaceBinding(key)
  if (binding) {
    binding.sessionId = ''
    bridge.setWorkspaceBinding(key, binding)
  } else {
    bridge.forgetSession(key)
  }
  bridge.clearMemory(key)
  await bridge.disposeSessionByKey(key)
}

export function rememberForRecall({ bridge, message, text }) {
  try {
    const images = (message.images ?? []).map((image) => image?.url ?? '').filter((url) => /^https?:\/\//.test(url))
    bridge.recallCache.remember(bridge.chatKeyOf(bridge.routeOf(message)), {
      messageId: message.messageId,
      userId: message.userId,
      name: message.senderName || String(message.userId),
      text,
      images,
    })
  } catch (error) {
    debugLog(`recall cache failed: ${error.message}`)
  }
}
