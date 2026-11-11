// Session / injection / lifecycle runtime setup.
import { join } from 'node:path'
import { createInjectionRuntime } from './injection-runtime.js'
import { createInjectionRunner } from './injection-runner.js'
import { createQueueRuntime } from './queue-runtime.js'
import { createSessionLifecycleRuntime } from './session-lifecycle-runtime.js'
import { createProactiveRuntime } from './proactive-runtime.js'
import { createInboundRuntime } from './inbound-runtime.js'
import { createSessionBindRuntime } from './session-bind-runtime.js'
import { createTurnRuntime } from './turn-runtime.js'
import { createSessionOpenRuntime } from './session-open-runtime.js'

export function createSessionSetup({ bridge, config, ctx, logger, defineTool, features, featureMeta, featureTools, callbacks }) {
  const injectionRuntime = createInjectionRuntime({
    config,
    trace: bridge.trace,
    injectWindows: bridge.injectWindows,
    sessions: bridge.sessions,
  })
  const injectionRunner = createInjectionRunner({
    bridge,
    config,
    server: bridge.server,
    sessions: bridge.sessions,
    trace: bridge.trace,
    gate: bridge.gate,
    timers: bridge.timers,
    injectFile: bridge.injectFile,
    injectTailer: bridge.injectTailer,
    deferredQueue: bridge.deferredQueue,
    beginWindow: callbacks.beginWindow,
    endWindow: callbacks.endWindow,
    onQqMessage: callbacks.onQqMessage,
    onNotice: callbacks.onNotice,
    onRequest: callbacks.onRequest,
  })
  const queueRuntime = createQueueRuntime({
    bridgeApi: callbacks.bridgeApi,
    onQqMessage: callbacks.onQqMessage,
    rateLimited: callbacks.rateLimited,
    setOutbox: (value) => { bridge.outbox = value },
    offsetFile: join(bridge.memoryDir, '..', 'qq-douyin-offset.json'),
  })
  const sessionLifecycleRuntime = createSessionLifecycleRuntime({
    bridge,
    ctx,
    logger,
    defineTool,
    features,
    featureMeta,
    featureTools,
    routeOf: callbacks.routeOf,
    modelSelection: callbacks.modelSelection,
    roleOf: callbacks.roleOf,
    ensureRoleCwd: callbacks.ensureRoleCwd,
    toolSurface: callbacks.toolSurface,
    presetForSurface: callbacks.presetForSurface,
    mountPreset: callbacks.mountPreset,
    applyRolePermission: callbacks.applyRolePermission,
    bindSession: callbacks.bindSession,
    recordAclSession: callbacks.recordAclSession,
    freshSessionId: callbacks.freshSessionId,
    sessionPrefix: callbacks.sessionPrefix,
    explainToolSurface: callbacks.explainToolSurface,
    brandSessionId: callbacks.brandSessionId,
    registerSession: callbacks.registerSession,
    installFeatureApi: callbacks.installFeatureApi,
    installBridgeApi: callbacks.installBridgeApi,
    cancelReminderByKey: callbacks.cancelReminderByKey,
    sendImageTo: callbacks.sendImageTo,
    sendImageBuffer: callbacks.sendImageBuffer,
    generateImage: callbacks.generateImage,
    drawAllowed: callbacks.drawAllowed,
    ownerQQ: callbacks.ownerQQ,
  })
  const proactiveRuntime = createProactiveRuntime({
    config,
    memoryDir: bridge.memoryDir,
    server: bridge.server,
    ownerQQ: callbacks.ownerQQ,
    contactsInfo: callbacks.contactsInfo,
    onQqMessage: callbacks.onQqMessage,
    handleInjection: callbacks.handleInjection,
    transcribe: callbacks.transcribe,
    setInjectReplyTarget: callbacks.setInjectReplyTarget,
    features,
    sessions: bridge.sessions,
    flushDeferred: callbacks.flushDeferred,
    sendImageTo: callbacks.sendImageTo,
  })
  const inboundRuntime = createInboundRuntime({ features, defineTool, bridge })
  const sessionBindRuntime = createSessionBindRuntime(bridge)
  const turnRuntime = createTurnRuntime({
    config,
    routeKey: callbacks.routeKey,
    sessions: bridge.sessions,
    forgetSession: callbacks.forgetSession,
    logger,
  })
  const sessionOpenRuntime = createSessionOpenRuntime({
    bridge,
    config,
    logger,
    workspaceBinding: callbacks.workspaceBinding,
    openWorkspaceSession: callbacks.openWorkspaceSession,
    storedSessionId: callbacks.storedSessionId,
    resumeSession: callbacks.resumeSession,
    resolveOwnershipConflict: callbacks.resolveOwnershipConflict,
    createSession: callbacks.createSession,
    forgetSession: callbacks.forgetSession,
  })
  return { injectionRuntime, injectionRunner, queueRuntime, sessionLifecycleRuntime, proactiveRuntime, inboundRuntime, sessionBindRuntime, turnRuntime, sessionOpenRuntime }
}
