// Injection channel runtime: tailer, polling, queue compaction, guard, and dispatch.
import { pollInjections as pollInjectionsService } from './inject-poller.js'
import { compactInjectQueue as compactInjectQueueService } from './inject-compact.js'
import { handleInjection as handleInjectionCore } from '../core/inject-handler.js'
import { InjectGuard } from '../core/inject-guard.js'
import { countLines, parseInjectionLine } from '../inbox.js'
import { summarizeSegments } from '../core/segment-text.js'
import { debugLog } from '../core/debug-log.js'

export function createInjectionRunner({
  bridge,
  config,
  server,
  sessions,
  trace,
  gate,
  timers,
  injectFile,
  injectTailer,
  deferredQueue,
  beginWindow,
  endWindow,
  onQqMessage,
  onNotice,
  onRequest,
}) {
  let guardService = null
  let interval = 0

  function startInjectPoll() {
    if (config.injectEnabled !== true) return
    interval = Math.max(500, Number(config.injectIntervalMs) || 2000)
    bridge.injectInterval = interval
    injectTailer.reset(true)
    const queued = countLines(injectFile)
    if (queued > 0) {
      trace?.event({
        id: '', level: 'info', module: 'bridge', stage: 'inject', ok: true,
        reason: `注入队列已有 ${queued} 行历史记录，本次启动跳过（只处理启动后新增的行）`,
        data: { file: injectFile, skipped: queued },
      })
    }
    const timer = setInterval(() => { void poll() }, interval)
    if (typeof timer.unref === 'function') timer.unref()
    timers.add(timer)
    debugLog(`injection channel armed: ${injectFile} (dryRun=${config.injectDryRun !== false}, every ${interval}ms, skipped=${queued})`)
  }

  async function poll() {
    return pollInjectionsService({
      stopped: bridge.stopped === true,
      injecting: bridge.injecting === true,
      retryDeferred: () => retryDeferred(),
      injectTailer,
      parseInjectionLine,
      handleInjection: (kind, frame) => handle(kind, frame),
      compactQueue: () => compact(),
      trace,
      config,
      debugLog,
      onConsumed: () => {
        bridge.injectConsumed = (bridge.injectConsumed ?? 0) + 1
        bridge.injectLastAt = Date.now()
      },
    })
  }

  function compact() {
    return compactInjectQueueService({
      injectFile,
      injectTailer,
      trace,
      onConsumed: () => { bridge.injectConsumed = 0 },
      debugLog,
    })
  }

  function guard(kind, frame) {
    guardService ??= new InjectGuard()
    const blocked = guardService.check(kind, frame)
    if (blocked !== '') {
      debugLog('[inject-guard] ' + blocked + ' dropped: ' + String(frame?.text ?? '').slice(0, 40).replace(/\s+/g, ' '))
    }
    return blocked
  }

  async function handle(kind, frame) {
    return handleInjectionCore({
      kind,
      frame,
      host: {
        server,
        config,
        sessions,
        routeKey: (m) => bridge.routeKey(m),
        deferredQueue,
        trace,
        guard: (k, f) => guard(k, f),
        gate,
        beginWindow: (k) => beginWindow(k),
        endWindow: (k) => endWindow(k),
        onQqMessage: (m) => onQqMessage(m),
        onNotice: (m) => onNotice(m),
        onRequest: (m) => onRequest(m),
        setInjecting: (v) => { bridge.injecting = v },
        writeSnapshot: (f) => bridge.writeRuntimeSnapshot(f),
        summarizeSegments,
      },
    })
  }

  async function retryDeferred() {
    if (deferredQueue.size === 0) return
    const result = await deferredQueue.drain({
      isBusy: (item) => sessions.get(bridge.routeKey({ ...item.frame, bot: server.currentSocket() }))?.turnActive === true,
      dispatch: async (item) => handle(item.kind, item.frame),
    })
    if (result.expired > 0) {
      trace?.event({
        id: '', level: 'warn', module: 'bridge', stage: 'inject', ok: false, chatKey: '',
        reason: `注入推迟超过 5 分钟仍未等到会话空闲，已丢弃 ${result.expired} 条`,
      })
    }
  }

  return { startInjectPoll, poll, compact, guard, handle, retryDeferred }
}
