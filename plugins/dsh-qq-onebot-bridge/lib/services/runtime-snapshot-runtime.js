// Runtime snapshot file.
import { writeJsonAtomic } from '../store.js'
import { buildRuntimeSnapshot } from './runtime-snapshot.js'
import { collectRuntimeSnapshot } from './runtime-snapshot-state.js'
import { countLines } from '../inbox.js'
import { debugLog } from '../core/debug-log.js'

export function writeRuntimeSnapshot({ bridge, force = false, ttl }) {
  const now = Date.now()
  if (!force && now - bridge.runtimeLastAt < 2000) return
  bridge.runtimeLastAt = now
  try {
    writeJsonAtomic(bridge.runtimeFile, buildRuntimeSnapshot(collectRuntimeSnapshot({
      bridge,
      featureFlags: () => bridge.featureFlags(),
      replayHints: () => bridge.replayHints(),
      botAdminTtlMs: ttl,
      countLines,
      now,
    })))
  } catch (error) {
    debugLog(`runtime snapshot failed: ${error.message}`)
  }
}
