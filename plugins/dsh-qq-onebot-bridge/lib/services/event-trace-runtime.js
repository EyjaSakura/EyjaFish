// Trace for notice/request events.
import { beginTrace } from '../trace.js'

export function beginEventTrace({ bridge, kind, event }) {
  if (!bridge.trace?.enabled) return null
  const trace = beginTrace(bridge.trace, {
    chatKey: event.groupId ? `g:${event.groupId}` : (event.userId ? `u:${event.userId}` : ''),
    userId: event.userId ?? 0,
    groupId: event.groupId ?? 0,
    messageType: event.groupId ? 'group' : 'private',
    text: `${kind}:${event.noticeType ?? event.requestType ?? ''}/${event.subType ?? ''}`,
  })
  if (event.__injected === true) trace.mark('inject', { ok: true, reason: '来自注入器（非真实 QQ 事件）' })
  if (event.__replayed === true) trace.mark('replay', { ok: true, reason: '来自离线回放（沙箱 + dry-run，不碰 QQ）' })
  return trace
}
