// Session lifecycle runtime: create / resume / register / per-session install.
// Bridge supplies callbacks for private helpers; this module owns the host wiring.
import { createSession as createSessionCore, resumeSession as resumeSessionCore } from '../core/session-factory.js'
import { createSessionEntry } from '../core/session-entry.js'
import { installSession } from '../session-install.js'
import { installSessionExtras } from './session-extras.js'
import { debugLog } from '../core/debug-log.js'

export function createSessionLifecycleRuntime({
  bridge,
  ctx,
  logger,
  defineTool,
  features,
  featureMeta,
  featureTools,
  routeOf,
  modelSelection,
  roleOf,
  ensureRoleCwd,
  toolSurface,
  presetForSurface,
  mountPreset,
  applyRolePermission,
  bindSession,
  recordAclSession,
  freshSessionId,
  sessionPrefix,
  explainToolSurface,
  brandSessionId,
  registerSession,
  installFeatureApi,
  installBridgeApi,
  cancelReminderByKey,
  sendImageTo,
  sendImageBuffer,
  generateImage,
  drawAllowed,
  ownerQQ,
}) {
  const hostBase = () => ({
    routeOf,
    modelSelection,
    roleOf,
    ensureRoleCwd,
    toolSurface,
    presetForSurface,
    mountPreset,
    applyRolePermission,
    recordAclSession,
    freshSessionId,
    sessionPrefix,
    explainToolSurface,
    bindSession,
    registerSession,
    logger,
    debugLog,
  })

  async function install(agentCtx, route, key, opts) {
    const result = await installSession({
      agentCtx, route, key, opts,
      defineTool,
      debugLog,
      bridge,
    })
    await installSessionExtras({
      agentCtx, route, key, opts, defineTool, debugLog,
      features,
      featureMeta,
      featureTools,
      roleOf,
      featureApi: installFeatureApi,
      bridgeApi: installBridgeApi,
      cancelReminderByKey,
      sendImageTo,
      sendImageBuffer,
      generateImage,
      drawAllowed,
      ownerQQ,
    })
    return result
  }

  async function create(message, key, opts = {}) {
    return createSessionCore({
      message, key, opts,
      host: {
        ...hostBase(),
        createAgent: (args) => ctx.agents.create(args),
        installSession: (c, r, k, o) => install(c, r, k, o),
      },
    })
  }

  async function resume(message, key, sessionId) {
    return resumeSessionCore({
      message, key, sessionId,
      host: {
        ...hostBase(),
        resumeAgent: (args) => ctx.agents.resume(args),
        brandSessionId,
        createSession: (m, k) => create(m, k),
        installSession: (c, r, k, o) => install(c, r, k, o),
      },
    })
  }

  function register(key, route, handle, { resumed = false } = {}) {
    const entry = createSessionEntry({ key, route, handle, resumed })
    bridge.sessions.set(key, entry)
    bridge.agents.set(entry.sessionId, entry)
    bridge.writeRuntimeSnapshot(true)
    return entry
  }

  return { create, resume, install, register }
}
