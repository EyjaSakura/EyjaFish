// Workspace membership bridge adapters.
import { ensureWorkspaceMembership as ensureWorkspaceMembershipService, findWorkspaceEntity } from './workspace-membership.js'
import { backfillWorkspaceMembership as backfillWorkspaceMembershipService } from './workspace-backfill.js'
import { workspaceProjectKey } from '../core/workspace-key.js'
import { debugLog } from '../core/debug-log.js'

export function ensureWorkspaceMembershipForBridge({ bridge, binding, sessionId, key = '', source = '' }) {
  return ensureWorkspaceMembershipService({
    binding,
    sessionId,
    key,
    source,
    resolveRegistry: () => bridge.resolveWorkspaceRegistryFor(),
    noteRegistryOnce: (registry) => bridge.noteWorkspaceRegistryOnceFor(registry),
    trace: bridge.trace,
    debugLog,
  })
}

export function backfillWorkspaceMembershipForBridge({ bridge }) {
  return backfillWorkspaceMembershipService({
    workspaceStore: bridge.workspaceStore,
    resolveRegistry: () => bridge.resolveWorkspaceRegistryFor(),
    noteRegistryOnce: (registry) => bridge.noteWorkspaceRegistryOnceFor(registry),
    findEntity: (registry, path) => findWorkspaceEntity({ registry, path, debugLog }),
    sessionRootDir: bridge.sessionRootDir,
    setPending: (value) => { bridge.workspaceBackfillPending = value },
    workspaceProjectKey,
    trace: bridge.trace,
    debugLog,
  })
}
