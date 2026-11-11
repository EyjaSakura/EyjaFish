// Content filter + history search + incoming video commands.
import { handleContentFilter as handleContentFilterService } from './content-filter.js'
import { handleHistorySearch as handleHistorySearchService } from './history-search.js'
import { formatHistoryLines } from '../history.js'
import { debugLog } from '../core/debug-log.js'

export async function handleContentFilter({ bridge, message, text }) {
  return handleContentFilterService({
    message,
    text,
    config: bridge.config,
    canRun: (m, cap) => bridge.canRun(m, cap),
    chatKey: bridge.chatKeyOf(bridge.routeOf(message)),
    groupId: message.messageType === 'group' ? message.groupId : 0,
    socket: bridge.server.currentSocket(),
    floodGuard: bridge.floodGuard,
    gate: bridge.gate,
    server: bridge.server,
    safeReply: (m, t) => bridge.safeReply(m, t),
    wordFilter: bridge.wordFilter(),
    debugLog,
  })
}

export async function handleHistorySearch({ bridge, message, text }) {
  return handleHistorySearchService({
    message,
    text,
    config: bridge.config,
    canRun: (m, cap) => bridge.canRun(m, cap),
    archive: bridge.archive,
    chatKey: bridge.chatKeyOf(bridge.routeOf(message)),
    safeReply: (m, t) => bridge.safeReply(m, t),
    formatHistoryLines,
    debugLog,
  })
}

export async function handleIncomingVideo({ bridge, message, defineTool }) {
  return bridge.dispatchFeature('handleIncomingVideo', {
    message,
    defineTool,
    debugLog,
    bridge: bridge.bridgeApi(),
  })
}
