// Session maintenance runtime: header read, reconcile, preclaim, maintenance
// steps, and the chat -> session map helpers.
import { join } from 'node:path'
import { readFileSync, readdirSync } from 'node:fs'
import zlib from 'node:zlib'
import { readHeaderAt as readHeaderAtService } from './session-header.js'
import { reconcileSessions as reconcileSessionsService } from './session-reconcile.js'
import { preclaimSessions as preclaimSessionsService } from './preclaim-sessions.js'
import { runSessionMaintenance } from '../core/session-maintenance.js'
import { collectBindingTargets } from './binding-targets.js'
import { debugLog } from '../core/debug-log.js'

export function createSessionMaintenanceRuntime({
  config,
  sessionRootDir,
  sessionStore,
  workspaceStore,
  trace,
  logger,
  syntheticMessageForKey,
  roleOf,
  bindSession,
  resumeSession,
  backfillWorkspaceMembership,
  reportWatchdogIncidents,
  isWriterHeld,
}) {
  function readHeaderAt(dir) {
    return readHeaderAtService({
      dir,
      readdir: readdirSync,
      join,
      readFile: (file) => readFileSync(file),
      zstdDecompressSync: zlib.zstdDecompressSync,
      debugLog,
    })
  }

  function bindingTargets() {
    return collectBindingTargets({ workspaceStore, sessionStore, debugLog })
  }

  function reconcileSessions() {
    return reconcileSessionsService({
      enabled: config.reconcileSessions !== false,
      root: sessionRootDir,
      readHeaderAt: (dir) => readHeaderAt(dir),
      bindingTargets: () => bindingTargets(),
      syntheticMessage: (key) => syntheticMessageForKey(key),
      roleOf: (m) => roleOf(m),
      bindSession: (k, id, src) => bindSession(k, id, src),
      logger,
      trace,
      debugLog,
    })
  }

  function startSessionMaintenance() {
    return runSessionMaintenance({
      debugLog,
      steps: [
        { label: 'reconcile', run: () => reconcileSessions() },
        { label: 'preclaim', run: () => preclaimSessions() },
        { label: 'workspace backfill', run: () => backfillWorkspaceMembership() },
        { label: 'watchdog alert', run: () => reportWatchdogIncidents() },
      ],
    })
  }

  function preclaimSessions() {
    return preclaimSessionsService({
      config,
      bindingTargets: () => bindingTargets(),
      syntheticMessageForKey: (key) => syntheticMessageForKey(key),
      roleOf: (m) => roleOf(m),
      resumeSession: (m, k, id) => resumeSession(m, k, id),
      bindSession: (k, id, source) => bindSession(k, id, source),
      logger,
      trace,
      isWriterHeld: (error) => isWriterHeld(error),
      debugLog,
    })
  }

  function storedSessionId(key) {
    const data = sessionStore.read()
    const id = data ? data[key] : ''
    return typeof id === 'string' && id !== '' ? id : ''
  }

  function rememberSession(key, sessionId) {
    try {
      sessionStore.mutate((data) => { data[key] = String(sessionId) })
    } catch (error) {
      debugLog(`session map write failed: ${error.message}`)
    }
  }

  return { readHeaderAt, bindingTargets, reconcileSessions, startSessionMaintenance, preclaimSessions, storedSessionId, rememberSession }
}
