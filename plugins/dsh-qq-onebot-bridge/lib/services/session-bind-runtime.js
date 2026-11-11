// Single source of truth for chatKey -> session binding.
import { bindSession as bindSessionService } from './session-bind.js'

export function createSessionBindRuntime(bridge) {
  return {
    bind(key, sessionId, source = 'open') {
      return bindSessionService({
        key,
        sessionId,
        source,
        getBinding: (k) => bridge.workspaceBinding(k),
        setBinding: (k, binding) => bridge.setWorkspaceBinding(k, binding),
        rememberSession: (k, id) => bridge.rememberSession(k, id),
        ensureMembership: (binding, id, k, src) => bridge.ensureWorkspaceMembership(binding, id, k, src),
        backfill: () => bridge.backfillWorkspaceMembership(),
        isBackfillPending: () => bridge.workspaceBackfillPending === true,
        clearBackfillPending: () => { bridge.workspaceBackfillPending = false },
        trace: bridge.trace,
      })
    },
  }
}