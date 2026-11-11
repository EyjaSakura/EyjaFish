// Bridge start/stop lifecycle: event wiring, effective config write, timer boot,
// heartbeat, and orderly shutdown.
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { scheduleBridgeTimers } from './startup-scheduler.js'
import { debugLog } from '../core/debug-log.js'

const CALLBACKS = ['onSessionEvent', 'onTransferRequested', 'onServer', 'onQqMessage', 'onNotice', 'onRequest', 'onBotDisconnect', 'reportWatchdogIncidents', 'proactiveIdentityAsk', 'flushOutbox', 'maybeStartupGreet', 'backfillRecent', 'loadReminders', 'clearStaleQueues', 'loadOutbox']
const TIMERS = ['flushOutbox', 'maaNotifyTick', 'pollQzoneComments', 'maybeAutoPostQzone', 'flushAllDeferred', 'pollDouyinInbox', 'resetStuckTurns', 'pollAnalyzeResults', 'maybeChooseActivity', 'maybeDouyinSpark', 'maybeDouyinBrowse', 'runRetentionSweep', 'startRetentionSweeper', 'logDevGroups', 'startVerifySweeper', 'scheduleDailyReport', 'startInjectPoll', 'startExternalServices', 'startSessionMaintenance']

function buildCallbacks(bridge) {
  const callbacks = {}
  for (const name of CALLBACKS) callbacks[name] = (...args) => bridge[name](...args)
  callbacks.timers = {}
  for (const name of TIMERS) callbacks.timers[name] = (...args) => bridge[name](...args)
  return callbacks
}

export function startBridge({ bridge, ctx, disposers, callbacks = buildCallbacks(bridge) }) {
  disposers.push(ctx.on('session/event', (session, event) => callbacks.onSessionEvent(session, event)))
  if (typeof ctx.on === 'function') {
    disposers.push(ctx.on('context-handoff/requested', (payload) => void callbacks.onTransferRequested(payload)))
  }
  disposers.push(callbacks.onServer('message', (message) => void callbacks.onQqMessage(message)))
  disposers.push(callbacks.onServer('notice', (notice) => void callbacks.onNotice(notice)))
  disposers.push(callbacks.onServer('request', (request) => void callbacks.onRequest(request)))
  disposers.push(callbacks.onServer('bot-disconnect', (socket) => callbacks.onBotDisconnect(socket)))
  disposers.push(callbacks.onServer('bot-connect', () => {
    bridge.botOnline = true
    bridge.botOnlineAt = Date.now()
    try { bridge.writeRuntimeSnapshot(true) } catch { /* snapshot is best-effort */ }
    bridge.notify('✅ QQ 机器人已上线')
    void callbacks.reportWatchdogIncidents().catch(() => {})
    void callbacks.proactiveIdentityAsk().catch(() => {})
    void callbacks.flushOutbox().catch(() => {})
    setTimeout(() => { try { callbacks.maybeStartupGreet() } catch (e) { debugLog('[startup-greet] error: ' + e.message) } }, 15_000)
    setTimeout(() => { void callbacks.backfillRecent().catch((e) => debugLog('[backfill] error: ' + e.message)) }, 25_000)
    setTimeout(() => { try { const socket = bridge.server.currentSocket(); if (socket) bridge.server.action(socket, 'get_cookies', { domain: 'qzone.qq.com' }).then((r) => { const ck = String((r && (r.cookies || r.data?.cookies)) || ''); const bk = String((r && (r.bkn || r.data?.bkn)) || ''); const un = (ck.match(/(?:^|;\s*)uin=o?(\d+)/) || [])[1] || ''; if (ck && bk && un) { bridge.qzoneCookieCache = { cookies: ck, bkn: bk, uin: un, at: Date.now() }; writeFileSync(join(bridge.memoryDir, '..', 'qq-qzone-cookies.json'), JSON.stringify(bridge.qzoneCookieCache), 'utf8') } }).catch(() => {}) } catch { /* ignore */ } }, 5000)
  }))
  callbacks.loadReminders()
  try {
    writeFileSync(join(bridge.memoryDir, '..', 'qq-effective.json'), JSON.stringify({
      at: Date.now(),
      rateLimitEnabled: bridge.config.rateLimitEnabled,
      rateLimitMaxReplies: bridge.config.rateLimitMaxReplies,
      rateLimitWindowSeconds: bridge.config.rateLimitWindowSeconds,
    }, null, 2), 'utf8')
  } catch { /* ignore */ }
  callbacks.clearStaleQueues()
  bridge.outbox ??= callbacks.loadOutbox()
  globalThis.__qzoneTimerPlaceholder ??= 0
  globalThis.__qqBridgeTimers = scheduleBridgeTimers({
    bridge,
    config: bridge.config,
    timers: bridge.timers,
    globalTimers: globalThis.__qqBridgeTimers ?? [],
    callbacks: callbacks.timers,
  })
  const heartbeat = setInterval(
    () => bridge.writeRuntimeSnapshot(true),
    Math.max(50, Number(bridge.runtimeHeartbeatMs) || 60_000),
  )
  if (typeof heartbeat.unref === 'function') heartbeat.unref()
  bridge.timers.add(heartbeat)
  bridge.notify('🔌 QQ 桥已就绪')
}

export function stopBridge({ bridge, callbacks }) {
  bridge.stopped = true
  callbacks.stopExternalServices()
  for (const timer of bridge.timers) clearTimeout(timer)
  bridge.timers.clear()
  for (const dispose of bridge.disposers.splice(0)) dispose()
  const handles = [...bridge.sessions.values()].map((entry) => entry.handle)
  bridge.sessions.clear()
  bridge.agents.clear()
  void Promise.allSettled(handles.map((handle) => handle.dispose()))
}
