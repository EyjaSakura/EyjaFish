// External services start + auto-heal + session transfer.
import { spawn } from 'node:child_process'
import { tryAutoHeal as tryAutoHealService } from './auto-heal.js'
import { onTransferRequested as onTransferRequestedService } from './session-transfer.js'
import { handleBroadcastCommand as handleBroadcastCommandService } from './broadcast-command.js'
import { reportWatchdogIncidents as reportWatchdogIncidentsService } from './watchdog-alert.js'
import { summarizeWatchdogIncidents } from './watchdog-report.js'
import { debugLog } from '../core/debug-log.js'

export function startExternalServices({ bridge }) {
  if (bridge.broadcast) {
    try {
      bridge.broadcast.start()
      const enabled = bridge.broadcast.list().filter((job) => job.enabled).length
      bridge.trace?.event({ id: '', stage: 'broadcast', ok: true, reason: `定时播报已启动（${enabled} 个任务启用）` })
    } catch (error) {
      bridge.trace?.event({ id: '', stage: 'broadcast', ok: false, level: 'error', reason: `定时播报启动失败：${error.message}` })
    }
  }
  if (bridge.webhook) {
    void bridge.webhook.start().then(
      () => bridge.trace?.event({ id: '', stage: 'webhook', ok: true, reason: `入站 webhook 已监听 127.0.0.1:${bridge.config.webhookPort}` }),
      (error) => bridge.trace?.event({ id: '', stage: 'webhook', ok: false, level: 'error', reason: `入站 webhook 启动失败（端口被占？）：${error.message}` }),
    )
  }
}

export function stopExternalServices({ bridge }) {
  try {
    bridge.saveBroadcastState()
    bridge.broadcast?.stop()
  } catch (error) {
    debugLog(`broadcast stop failed: ${error.message}`)
  }
  try {
    void bridge.webhook?.stop()
  } catch (error) {
    debugLog(`webhook stop failed: ${error.message}`)
  }
  bridge.saveEngageState()
}

export async function handleBroadcastCommand({ bridge, message, text }) {
  return handleBroadcastCommandService({
    message,
    text,
    config: bridge.config,
    canRun: (m, cap) => bridge.canRun(m, cap),
    broadcast: bridge.broadcast,
    webhook: bridge.webhook,
    safeReply: (m, t) => bridge.safeReply(m, t),
  })
}

export async function reportWatchdogIncidents({ bridge, bindingTargets, syntheticMessage, roleOf, safeReply }) {
  return reportWatchdogIncidentsService({
    config: bridge.config,
    server: bridge.server,
    incidentFile: bridge.watchdogIncidentFile,
    stateFile: bridge.watchdogAlertStateFile,
    summarize: summarizeWatchdogIncidents,
    bindingTargets,
    syntheticMessage,
    roleOf,
    safeReply,
    trace: bridge.trace,
    debugLog,
  })
}

export function tryAutoHeal({ bridge, healCommandLabel }) {
  bridge.autoHealAt = tryAutoHealService({
    config: bridge.config,
    trace: bridge.trace,
    logger: bridge.logger,
    spawn,
    healCommandLabel,
    history: bridge.autoHealAt,
  })
}

export async function onTransferRequested({ bridge, payload }) {
  return onTransferRequestedService({
    config: bridge.config,
    payload,
    findChatForSession: (id) => bridge.findChatForSessionById(id),
    roleOf: (m) => bridge.roleOf(m),
    emit: (event, data) => bridge.ctx.emit(event, data),
    workspaceBinding: (k) => bridge.workspaceBinding(k),
    createSession: (m, k, opts) => bridge.createSessionFor(m, k, opts),
    handoff: (s, m, d) => bridge.handoff(s, m, d),
    replyTo: (route, text) => bridge.replyTo(route, text),
    routeOf: (m) => bridge.routeOf(m),
    logger: bridge.logger,
    trace: bridge.trace,
    debugLog,
  })
}
