// Session open/ensure runtime: resolve the chat's persisted session or open a
// fresh one, with workspace/ownership fallbacks.
import { openSession as openSessionCore } from '../core/session-opener.js'
import { debugLog } from '../core/debug-log.js'

export function createSessionOpenRuntime({
  bridge,
  config,
  logger,
  workspaceBinding,
  openWorkspaceSession,
  storedSessionId,
  resumeSession,
  resolveOwnershipConflict,
  createSession,
  forgetSession,
}) {
  async function ensureSession(message) {
    if (bridge.workspaceBackfillPending === true) {
      bridge.workspaceBackfillPending = false
      try {
        void bridge.backfillWorkspaceMembership().catch(() => {})
      } catch { /* best effort */ }
    }
    const key = bridge.routeKey(message)
    const existing = bridge.sessions.get(key)
    if (existing !== undefined) return existing
    const pending = bridge.creating.get(key)
    if (pending !== undefined) return pending
    const creating = openSession(message, key)
    bridge.creating.set(key, creating)
    try {
      return await creating
    } finally {
      bridge.creating.delete(key)
    }
  }

  async function openSession(message, key) {
    return openSessionCore({
      message,
      key,
      host: {
        workspaceBinding,
        openWorkspaceSession,
        storedSessionId,
        resumeSession,
        resolveOwnershipConflict,
        createSession,
        forgetSession,
        config,
        logger,
        debugLog,
      },
    })
  }

  return { ensureSession, openSession }
}
