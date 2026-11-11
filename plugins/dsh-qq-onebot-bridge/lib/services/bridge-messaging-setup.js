// Trace + media/sent-history/recent/keyword/messaging runtime setup.
import { TraceRecorder } from '../trace.js'
import { createMediaSendRuntime } from './media-send-runtime.js'
import { createSentHistoryRuntime } from './sent-history-runtime.js'
import { createRecentRuntime } from './recent-runtime.js'
import { createKeywordRuntime } from './keyword-runtime.js'
import { createMessagingRuntime } from './messaging-runtime.js'
import { pathOf } from '../paths.js'
import { debugLog } from '../core/debug-log.js'

export function createMessagingSetup({ bridge, config, defineTool }) {
  const mediaSendRuntime = createMediaSendRuntime({
    config,
    server: bridge.server,
    mediaDir: bridge.mediaDir,
    gate: bridge.gate,
    trackSent: (key, data) => bridge.trackSent(key, data),
    chatKeyOf: (route) => bridge.chatKeyOf(route),
    synthVoiceFile: (text) => bridge.synthVoiceFile(text),
  })
  const sentHistoryRuntime = createSentHistoryRuntime({
    sentMessages: bridge.sentMessages,
    config,
    gate: bridge.gate,
    server: bridge.server,
    debugLog,
  })
  const recentRuntime = createRecentRuntime({ sentMessages: bridge.sentMessages })
  const keywordRuntime = createKeywordRuntime({
    keywordStore: bridge.keywordStore,
    routeKey: (message) => bridge.routeKey(message),
    recordMemory: (key, role, text) => bridge.recordMemory(key, role, text),
    safeReply: (message, text) => bridge.safeReply(message, text),
    sendImageTo: (route, file) => bridge.sendImageTo(route, file),
    routeOf: (message) => bridge.routeOf(message),
    imageDir: bridge.imageDir,
    cwd: config.cwd || process.cwd(),
  })
  const trace = new TraceRecorder({
    file: config.traceFile || pathOf(config, 'trace'),
    memoryLimit: config.traceMemorySize,
    enabled: config.traceEnabled !== false,
    level: config.traceLevel,
  })
  const messagingRuntime = createMessagingRuntime({
    bridge,
    config,
    trace,
    gate: bridge.gate,
    server: bridge.server,
    chatKeyOf: (route) => bridge.chatKeyOf(route),
    routeOf: (message) => bridge.routeOf(message),
    getInjectWindows: () => bridge.injectWindows,
    trackSent: (key, data) => bridge.trackSent(key, data),
    defineTool,
  })
  return { mediaSendRuntime, sentHistoryRuntime, recentRuntime, keywordRuntime, trace, messagingRuntime }
}
