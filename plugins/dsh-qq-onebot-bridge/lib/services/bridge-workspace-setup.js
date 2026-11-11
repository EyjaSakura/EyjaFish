// Workspace / send-roots / ACL setup.
import { createWorkspaceRuntime } from './workspace-runtime.js'
import { createSendRootsRuntime } from './send-roots-runtime.js'
import { createAclSessionRuntime } from './acl-session-runtime.js'
import { bootstrapAcl } from './acl-bootstrap.js'
import { buildPolicyFromConfig } from '../acl-policy.js'
import { createAclReader, openAclStore } from '../acl-store.js'
import { rolesFor } from '../acl.js'
import { existsSync, readFileSync } from 'node:fs'
import { debugLog } from '../core/debug-log.js'

export function createWorkspaceSetup({ bridge, config, pathOf, callbacks }) {
  const workspaceRuntime = createWorkspaceRuntime({
    workspaceStore: bridge.workspaceStore,
    sessionRootDir: bridge.sessionRootDir,
    workspaceRegistryFile: bridge.workspaceRegistryFile,
    getCache: () => bridge.workspaceCache,
    setCache: (value) => { bridge.workspaceCache = value },
    canRun: (message, capabilityId) => bridge.canRun(message, capabilityId),
    routeKey: (message) => bridge.routeKey(message),
    safeReply: (message, text) => bridge.safeReply(message, text),
    roleOf: (message) => bridge.roleOf(message),
    disposeSession: (key) => callbacks.disposeSession(key),
    resumeSession: (message, key, sessionId) => callbacks.resumeSession(message, key, sessionId),
    bindSession: (key, sessionId) => callbacks.bindSession(key, sessionId),
    resolveOwnershipConflict: (message, key, sessionId, error) => callbacks.resolveOwnershipConflict(message, key, sessionId, error),
    createSession: (message, key, opts) => callbacks.createSession(message, key, opts),
    logger: bridge.logger,
  })
  const sendRootsRuntime = createSendRootsRuntime({
    config,
    workspaceStore: bridge.workspaceStore,
    exists: existsSync,
    readFile: (file) => readFileSync(file),
  })
  const aclReader = createAclReader({
    file: config.aclDbFile || pathOf(config, 'acl'),
    logger: bridge.logger,
    fallback: () => buildPolicyFromConfig(config),
  })
  const aclSessionRuntime = createAclSessionRuntime({
    config,
    pathOf,
    exists: existsSync,
    openStore: openAclStore,
    rolesFor,
    getPolicy: () => bridge.aclPolicy(),
    debugLog,
  })
  const aclBootstrapNote = bootstrapAcl({ config, logger: bridge.logger })
  return { workspaceRuntime, sendRootsRuntime, aclReader, aclSessionRuntime, aclBootstrapNote }
}
