// Apply messaging setup to the bridge instance.
export function applyMessagingSetup(bridge, s) {
  bridge.mediaSendRuntime = s.mediaSendRuntime
  bridge.sentHistoryRuntime = s.sentHistoryRuntime
  bridge.recentRuntime = s.recentRuntime
  bridge.keywordRuntime = s.keywordRuntime
  bridge.trace = s.trace
  bridge.messagingRuntime = s.messagingRuntime
}
