// Bridge constructor orchestration moved out of bridge.js.
import { createHash } from 'node:crypto'
import { pathOf } from '../paths.js'
import { explainToolSurface } from '../tool-grants.js'
import { generateImage } from '../imagegen.js'
import { InboxRecorder, createLineTailer } from '../inbox.js'
import { SessionRegistry } from '../core/session-registry.js'
import { DeferredInjectQueue } from '../core/deferred-inject-queue.js'
import { InjectWindowRegistry } from '../core/inject-window.js'
import { createBridgeBase } from './bridge-base-setup.js'
import { createCoreState } from './bridge-core-state.js'
import { applyCoreState } from './bridge-core-apply.js'
import { createStorageState } from './bridge-storage-setup.js'
import { applyStorageState } from './bridge-storage-apply.js'
import { createWorkspaceSetup } from './bridge-workspace-setup.js'
import { applyBridgeDefaults } from './bridge-defaults-state.js'
import { createMessagingSetup } from './bridge-messaging-setup.js'
import { applyMessagingSetup } from './bridge-messaging-apply.js'
import { createRetentionSetup } from './bridge-retention-setup.js'
import { createSessionSetup } from './bridge-session-setup.js'

export function initializeBridge({ bridge, ctx, config, server, logger, defineTool, features, featureMeta, featureTools, defaultPersona, brandSessionId, privates }) {
  function sessionPrefix(key) {
    const digest = createHash('sha256').update(key).digest('hex').slice(0, 24)
    return `qq-${digest}`
  }

  function freshSessionId(prefix, now = Date.now()) {
    return brandSessionId(`${prefix}-${now.toString(36)}`)
  }
    createBridgeBase({ bridge: bridge, ctx, config, server, logger, features: features, defineTool })
    const core = createCoreState({
      bridge: bridge,
      config,
      logger: bridge.logger,
      defaultPersona: defaultPersona,
      callbacks: {
        injectedTaskBlocked: (rem, label) => privates.injectedTaskBlocked(rem, label),
        getAclPolicy: () => privates.aclPolicy(),
        saveBroadcastState: () => privates.saveBroadcastState(),
        pingBroadcast: (address) => privates.pingBroadcast(address),
        formatBroadcastFeed: (xml, job) => privates.formatBroadcastFeed(xml, job),
        onWebhookEvent: (event) => privates.onWebhookEvent(event),
      },
    })
    applyCoreState(bridge, core)
    applyStorageState(bridge, createStorageState({ config }))
    const workspaceSetup = createWorkspaceSetup({
      bridge: bridge,
      config,
      pathOf,
      callbacks: {
        disposeSession: (key) => privates.disposeSession(key),
        resumeSession: (message, key, sessionId) => privates.resumeSession(message, key, sessionId),
        bindSession: (key, sessionId) => privates.bindSession(key, sessionId),
        resolveOwnershipConflict: (message, key, sessionId, error) => privates.resolveOwnershipConflict(message, key, sessionId, error),
        createSession: (message, key, opts) => privates.createSession(message, key, opts),
      },
    })
    bridge.workspaceRuntime = workspaceSetup.workspaceRuntime
    bridge.sendRootsRuntime = workspaceSetup.sendRootsRuntime
    bridge.aclCache = { at: 0, policy: null, source: '' }
    bridge.aclBootstrapNote = workspaceSetup.aclBootstrapNote
    bridge.aclReader = workspaceSetup.aclReader
    bridge.aclSessionRuntime = workspaceSetup.aclSessionRuntime
    applyBridgeDefaults(bridge, config)
    applyMessagingSetup(bridge, createMessagingSetup({ bridge: bridge, config, defineTool }))
    const retentionSetup = createRetentionSetup({
      bridge: bridge,
      config,
      callbacks: {
        syntheticMessageForKey: (key) => privates.syntheticMessageForKey(key),
        roleOf: (message) => bridge.roleOf(message),
        bindSession: (key, sessionId, source) => privates.bindSession(key, sessionId, source),
        resumeSession: (message, key, sessionId) => privates.resumeSession(message, key, sessionId),
        backfillWorkspaceMembership: () => bridge.backfillWorkspaceMembership(),
        reportWatchdogIncidents: () => bridge.reportWatchdogIncidents(),
        isWriterHeld: (error) => privates.isWriterHeld(error),
      },
    })
    bridge.retentionRuntime = retentionSetup.retentionRuntime
    bridge.sessionMaintenanceRuntime = retentionSetup.sessionMaintenanceRuntime
    bridge.runtimeFile = pathOf(config, 'runtime')
    bridge.runtimeLastAt = 0
    bridge.runtimeHeartbeatMs = 60_000
    bridge.inbox = new InboxRecorder({
      file: config.inboxFile || pathOf(config, 'inbox'),
      enabled: config.recordInbound !== false,
      redact: config.inboxRedact === true,
    })
    bridge.injectFile = config.injectFile || pathOf(config, 'inject')
    bridge.injectTailer = createLineTailer(bridge.injectFile)
    bridge.injecting = false
    // 注入拦截（按会话，不用全局 dry-run）：
    //   injectSync   —— 同步派发阶段的屏蔽窗口（chatKey → 到期时间），覆盖命令类同步回复
    //   deferred     —— 会话正在跑回合时推迟投递的注入（保证"一次注入 = 一个独立回合"）
    bridge.injectWindows = new InjectWindowRegistry()
    bridge.deferredQueue = new DeferredInjectQueue()
    bridge.sessions = new SessionRegistry()   // routeKey -> { handle, agent, sessionId, route }
    bridge.agents = new Map()
    bridge.creating = new Map()
    bridge.disposers = []
    bridge.stopped = false
    const sessionSetup = createSessionSetup({
      bridge: bridge,
      config,
      ctx: bridge.ctx,
      logger: bridge.logger,
      defineTool,
      features: features,
      featureMeta: featureMeta,
      featureTools: featureTools,
      callbacks: {
        beginWindow: (key) => privates.beginInjectWindow(key),
        endWindow: (key) => privates.endInjectWindow(key),
        onQqMessage: (message) => bridge.onQqMessage(message),
        onNotice: (notice) => bridge.onNotice(notice),
        onRequest: (request) => bridge.onRequest(request),
        bridgeApi: (p) => privates.bridgeApi(p),
        rateLimited: (key) => bridge.rateLimited(key),
        routeOf: (message) => bridge.routeOf(message),
        modelSelection: () => privates.modelSelection(),
        roleOf: (message) => bridge.roleOf(message),
        ensureRoleCwd: (role) => privates.ensureRoleCwd(role),
        toolSurface: (message) => bridge.toolSurface(message),
        presetForSurface: (role, surface) => privates.presetForSurface(role, surface),
        mountPreset: (ctx, presetId, where) => privates.mountPreset(ctx, presetId, where),
        applyRolePermission: (handle, role) => privates.applyRolePermission(handle, role),
        bindSession: (key, sessionId) => privates.bindSession(key, sessionId),
        recordAclSession: (entry, surface, kind) => privates.recordAclSession(entry, surface, kind),
        freshSessionId: (prefix) => freshSessionId(prefix),
        sessionPrefix: (key) => sessionPrefix(key),
        explainToolSurface: (surface) => explainToolSurface(surface),
        brandSessionId: (id) => brandSessionId(id),
        registerSession: (key, route, handle, opts) => privates.registerSession(key, route, handle, opts),
        installFeatureApi: () => privates.featureApi(),
        installBridgeApi: (p) => privates.bridgeApi(p),
        cancelReminderByKey: (...args) => privates.cancelReminderByKey(...args),
        sendImageTo: (...args) => bridge.sendImageTo(...args),
        sendImageBuffer: (...args) => bridge.sendImageBuffer(...args),
        generateImage: (prompt, options) => generateImage(bridge.config, prompt, options),
        drawAllowed: (subject) => bridge.drawAllowed(subject),
        ownerQQ: () => bridge.ownerQQ(),
        contactsInfo: () => bridge.contactsInfo(),
        handleInjection: (kind, frame) => bridge.handleInjection(kind, frame),
        transcribe: (payload) => bridge.transcribe(payload),
        setInjectReplyTarget: (target) => { bridge.injectReplyTarget = target },
        flushDeferred: (key) => bridge.flushDeferred(key),
        forgetSession: (key) => privates.forgetSession(key),
        workspaceBinding: (key) => bridge.workspaceBinding(key),
        openWorkspaceSession: (message, key, binding) => privates.openWorkspaceSession(message, key, binding),
        storedSessionId: (key) => privates.storedSessionId(key),
        resumeSession: (message, key, sessionId) => privates.resumeSession(message, key, sessionId),
        resolveOwnershipConflict: (message, key, sessionId, error) => privates.resolveOwnershipConflict(message, key, sessionId, error),
        createSession: (message, key) => privates.createSession(message, key),
      },
    })
    bridge.injectionRuntime = sessionSetup.injectionRuntime
    bridge.injectionRunner = sessionSetup.injectionRunner
    bridge.queueRuntime = sessionSetup.queueRuntime
    bridge.sessionLifecycleRuntime = sessionSetup.sessionLifecycleRuntime
    bridge.proactiveRuntime = sessionSetup.proactiveRuntime
    bridge.inboundRuntime = sessionSetup.inboundRuntime
    bridge.sessionBindRuntime = sessionSetup.sessionBindRuntime
    bridge.turnRuntime = sessionSetup.turnRuntime
    bridge.sessionOpenRuntime = sessionSetup.sessionOpenRuntime
}
