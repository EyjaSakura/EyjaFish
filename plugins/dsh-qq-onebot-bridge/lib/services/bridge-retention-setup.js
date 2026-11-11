// Retention + session maintenance setup.
import { createRetentionRuntime } from './retention-runtime.js'
import { createSessionMaintenanceRuntime } from './session-maintenance-runtime.js'

export function createRetentionSetup({ bridge, config, callbacks }) {
  const retentionRuntime = createRetentionRuntime({
    config,
    archive: bridge.archive,
    trace: bridge.trace,
    imageDir: bridge.imageDir,
    quoteDir: bridge.quoteDir,
    filesDir: bridge.filesDir,
    ttsDir: bridge.ttsDir,
    timers: bridge.timers,
    isStopped: () => bridge.stopped,
  })
  const sessionMaintenanceRuntime = createSessionMaintenanceRuntime({
    config,
    sessionRootDir: bridge.sessionRootDir,
    sessionStore: bridge.sessionStore,
    workspaceStore: bridge.workspaceStore,
    trace: bridge.trace,
    logger: bridge.logger,
    syntheticMessageForKey: callbacks.syntheticMessageForKey,
    roleOf: callbacks.roleOf,
    bindSession: callbacks.bindSession,
    resumeSession: callbacks.resumeSession,
    backfillWorkspaceMembership: callbacks.backfillWorkspaceMembership,
    reportWatchdogIncidents: callbacks.reportWatchdogIncidents,
    isWriterHeld: callbacks.isWriterHeld,
  })
  return { retentionRuntime, sessionMaintenanceRuntime }
}
