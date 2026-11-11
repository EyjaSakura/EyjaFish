// Per-message / per-event trace start.
import { beginTrace } from '../trace.js'

export function beginMessageTrace({ bridge, message }) {
  if (!bridge.trace?.enabled) return null
  const trace = beginTrace(bridge.trace, {
    chatKey: bridge.chatKeyOf(bridge.routeOf(message)),
    userId: message.userId ?? 0,
    groupId: message.groupId ?? 0,
    messageType: message.messageType ?? '',
    messageId: message.messageId ?? '',
    text: message.text ?? '',
  })
  message.__trace = trace
  if (message.__injected === true) trace.mark('inject', { ok: true, reason: '来自注入器（非真实 QQ 消息）' })
  if (message.__replayed === true) trace.mark('replay', { ok: true, reason: '来自离线回放（沙箱 + dry-run，不碰 QQ）' })
  return trace
}


