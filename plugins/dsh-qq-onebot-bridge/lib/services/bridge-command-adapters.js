// Bridge adapters for join/recall/backfill/ffmpeg commands.
import { execFile } from 'node:child_process'
import { unlinkSync } from 'node:fs'
import { handleJoinAnswer as handleJoinAnswerService } from './join-answer.js'
import { handleRecallNotice as handleRecallNoticeService } from './anti-recall.js'
import { backfillWorkspaceMembership as backfillWorkspaceMembershipService } from './workspace-backfill.js'
import { debugLog } from '../core/debug-log.js'
import { formatRecallNotice } from '../recall.js'
import { checkVerifyAnswer, formatPendingList } from '../verify.js'
import { handleVerifyCommand as handleVerifyCommandService } from './verify-command.js'
import { startVote as startVoteService } from './vote-start.js'
import { endVote as endVoteService } from './vote-lifecycle.js'
import { cancelReminder as cancelReminderService } from './reminder-command.js'
import { collectSticker as collectStickerService } from './sticker-collect.js'
import { runDailyReport as runDailyReportService } from './daily-report.js'
import { handleTodo as handleTodoService } from './todo-command.js'
import { saveFaceToQq as saveFaceToQqService } from './face-save.js'
import { resolveJoin as resolveJoinService } from './join-resolve.js'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { downloadMessageImages as downloadMessageImagesService } from './message-images.js'
import { downloadTo } from './download.js'
import { deliverExternal as deliverExternalService } from './deliver-external.js'
import { maybeAutoPostQzone, pollQzoneComments } from './qzone-poller.js'
import { onWebhookEvent as onWebhookEventService } from './webhook-event.js'
import { renderWebhook } from '../webhookfmt.js'
import { formatHandoffStatus as formatHandoffStatusService } from './handoff-status.js'
import { liveCapabilityBlock as liveCapabilityBlockService } from './live-perms.js'
import { expandForwards as expandForwardsCore } from './forward-expand.js'
import { fetchVoiceAudio as fetchVoiceAudioService } from './voice-audio.js'
import { existsSync } from 'node:fs'
import { registerInlineWebTools, registerScopedWebTools as registerScopedWebToolsModule } from '../tools/web-tools.js'
import { publishVote as publishVoteService } from './vote-lifecycle.js'
import { registerFaceTools as registerFaceToolsService } from './feature-registration.js'
import { maybeVote as maybeVoteService, showVote as showVoteService } from './vote-lifecycle.js'
import { transcribe as transcribeService } from './stt-service.js'
import { botAdminBlockedReason as botAdminBlockedReasonRuntime } from './group-admin-runtime.js'
import { cancelReminderByKey as cancelReminderByKeyService } from './reminder-command.js'
import { extractGifFrame as extractGifFrameService } from './gif-frame.js'
import { findChatForSession } from './session-lookup.js'
import { reportWatchdogIncidents as reportWatchdogIncidentsRuntime } from './misc-runtime.js'
import { parseMcAddress, pingMcServer, formatMcStatus } from '../mcping.js'
import { buildIdentityConfig } from '../core/identity-config.js'
import { pathOf, subjectDir } from '../paths.js'
import { normalizeRoleId } from '../acl-policy.js'
import { imageBlocksFor as imageBlocksForService } from './image-blocks.js'
import { createQzoneClient } from './qzone-client.js'
import { qzoneRequest as qzoneRequestService } from './qzone.js'

export async function registerScopedWebToolsForBridge({ bridge, agentCtx, key, defineTool }) {
  return registerScopedWebToolsModule({
    agentCtx,
    key,
    resolveWeb: () => bridge.resolveServiceFor('web', agentCtx) ?? bridge.resolveServiceFor('web'),
    registerInlineWebTools,
    defineTool,
    logger: bridge.logger,
    debugLog,
  })
}

export function onWebhookEventForBridge({ bridge, source, payload }) {
  return onWebhookEventService({
    source,
    payload,
    config: bridge.config,
    renderWebhook,
    deliverExternal: (chat, text, stage) => bridge.deliverExternal(chat, text, stage),
    trace: bridge.trace,
  })
}

export function maybeAutoPostQzoneForBridge({ bridge }) {
  return maybeAutoPostQzone({
    config: bridge.config,
    memoryDir: bridge.memoryDir,
    ownerQQ: () => bridge.ownerQQ(),
    handleInjection: (...a) => bridge.handleInjection(...a),
    debugLog,
  })
}

export function saveBroadcastStateForBridge({ bridge }) {
  if (!bridge.broadcast || !bridge.broadcastState) return
  try {
    bridge.broadcastState.write(bridge.broadcast.snapshot())
  } catch (error) {
    debugLog(`broadcast state save failed: ${error.message}`)
  }
}

export async function pingBroadcastForBridge({ bridge, address }) {
  const parsed = parseMcAddress(String(address ?? ''))
  if (!parsed) return { text: '', reason: `MC 地址无法解析：${String(address ?? '')}` }
  const status = await pingMcServer(parsed.host, parsed.port, Math.max(1000, Number(bridge.config.mcStatusTimeoutMs) || 5000))
  return { text: formatMcStatus(status, { address: `${parsed.host}:${parsed.port}` }), reason: '' }
}

export function reportWatchdogIncidentsForBridge({ bridge }) {
  return reportWatchdogIncidentsRuntime({
    bridge,
    bindingTargets: () => bridge.bindingTargetsFor(),
    syntheticMessage: (key) => bridge.priv_syntheticMessageForKey(key),
    roleOf: (m) => bridge.roleOf(m),
    safeReply: (m, t) => bridge.safeReply(m, t),
  })
}

export function imageBlocksForBridge({ bridge, files }) {
  return imageBlocksForService({
    files,
    attachments: bridge.resolveServiceFor('attachments'),
    readFile: (file) => readFileSync(file),
    debugLog,
  })
}

export function identityConfigForBridge({ bridge }) {
  return buildIdentityConfig({
    config: bridge.config,
    pathOf,
    subjectDir,
    normalizeRoleId,
  })
}

export function findChatForSessionForBridge({ bridge, sessionId }) {
  return findChatForSession({
    sessionId,
    agents: bridge.agents,
    workspaceStore: bridge.workspaceStore,
    sessionStore: bridge.sessionStore,
    syntheticMessageForKey: (key) => bridge.priv_syntheticMessageForKey(key),
  })
}

export function botAdminBlockedReasonForBridge({ bridge, groupId }) {
  return botAdminBlockedReasonRuntime({
    groupId,
    known: bridge.botAdminKnown,
    knownAt: bridge.botAdminKnownAt,
    ttl: 10 * 60_000,
  })
}

export function cancelReminderByKeyForBridge({ bridge, key, arg = '' }) {
  return cancelReminderByKeyService({
    key,
    arg,
    reminders: bridge.reminders,
    saveReminders: () => bridge.saveReminders(),
    safeReply: (m, t) => bridge.safeReply(m, t),
  })
}

export function extractGifFrameForBridge({ bridge, file }) {
  return extractGifFrameService({
    file,
    config: bridge.config,
    exists: existsSync,
    execFile,
    debugLog,
  })
}

export function showVoteForBridge({ bridge, message }) {
  return showVoteService({
    message,
    routeKey: (m) => bridge.routeKey(m),
    votes: bridge.votes,
    safeReply: (m, t) => bridge.safeReply(m, t),
  })
}

export function maybeVoteForBridge({ bridge, message }) {
  return maybeVoteService({
    message,
    routeKey: (m) => bridge.routeKey(m),
    votes: bridge.votes,
    debugLog,
  })
}

export function transcribeForBridge({ bridge, audio }) {
  return transcribeService({
    audio,
    config: bridge.config,
    ttsDir: bridge.ttsDir,
    resolveService: (name) => bridge.resolveServiceFor(name),
    debugLog,
  })
}

export function registerFaceToolsForBridge({ bridge, agentCtx, route, defineTool }) {
  return registerFaceToolsService({
    agentCtx,
    route,
    defineTool,
    bridge,
    chatKeyOf: (r) => bridge.chatKeyOf(r),
    linkSticker: (key, name) => bridge.linkLastSticker(key, name),
  })
}

export function engageTargetFor({ bridge, message, raw }) {
  const arg = String(raw ?? '').replace(/^[\/／](戳|点赞)\s*/, '').trim()
  const at = (message.ats ?? []).find((qq) => qq && qq !== bridge.config.botQq)
  if (at) return Number(at)
  const explicit = /(\d{5,11})/.exec(arg)
  if (explicit) return Number(explicit[1])
  if (/^(我|自己|me)$/i.test(arg)) return Number(message.userId) || 0
  return 0
}

export function qzoneClientForBridge({ bridge }) {
  bridge.qzoneClientService ??= createQzoneClient({
    getSocket: () => bridge.server.currentSocket(),
    action: (socket, action, params) => bridge.server.action(socket, action, params),
    request: (url, init) => qzoneRequestService(url, init, 3, { debugLog }),
    memoryDir: bridge.memoryDir,
    debugLog,
  })
  return bridge.qzoneClientService
}

export function publishVoteForBridge({ bridge, vote }) {
  return publishVoteService({
    vote,
    injectedTaskBlocked: (v, what) => bridge.injectedTaskBlockedFor(v, what),
    chatKeyOf: (route) => bridge.chatKeyOf(route),
    server: bridge.server,
    trace: bridge.trace,
    debugLog,
  })
}

export function formatHandoffStatusForBridge({ bridge, key }) {
  return formatHandoffStatusService({
    key,
    binding: bridge.workspaceBinding(key),
    entry: bridge.sessions.get(key),
    stored: bridge.config.sessionResumeEnabled === false ? '' : String(bridge.storedSessionIdFor(key) ?? ''),
    config: bridge.config,
    trace: bridge.trace,
  })
}

export function liveCapabilityBlockForBridge({ bridge, surface, exec }) {
  return liveCapabilityBlockService({
    config: bridge.config || {},
    surface,
    exec,
    exists: existsSync,
    readFile: (file) => readFileSync(file, 'utf8'),
    debugLog,
  })
}

export function expandForwardsForBridge({ bridge, message }) {
  return expandForwardsCore({
    message,
    maxNodes: bridge.config.forwardMaxNodes,
    maxChars: bridge.config.forwardMaxChars,
    getForwardMsg: (socket, id) => bridge.server.getForwardMsg(socket, id),
    currentSocket: () => bridge.server.currentSocket(),
    debugLog,
  })
}

export function fetchVoiceAudioForBridge({ bridge, message, record }) {
  return fetchVoiceAudioService({
    message,
    record,
    getRecord: (bot, file, format) => bridge.server.getRecord(bot, file, format),
    debugLog,
  })
}

export function deliverExternalForBridge({ bridge, chatKey, text, stage }) {
  return deliverExternalService({
    chatKey,
    text,
    stage,
    routeFromChatKey: (k) => bridge.routeFromChatKeyFor(k),
    server: bridge.server,
    replyTo: (route, body, opts) => bridge.replyTo(route, body, opts),
    trace: bridge.trace,
  })
}

export function pollQzoneCommentsForBridge({ bridge }) {
  return pollQzoneComments({
    config: bridge.config,
    memoryDir: bridge.memoryDir,
    fetchList: (limit) => bridge.qzoneFetchList(limit),
    ownerQQ: () => bridge.ownerQQ(),
    setSelfState: (a, b, c) => bridge.setSelfState(a, b, c),
    handleInjection: (...a) => bridge.handleInjection(...a),
    debugLog,
  })
}

export function onBotDisconnectForBridge({ bridge, socket }) {
  bridge.botOnline = false
  bridge.botOnlineAt = Date.now()
  try { bridge.writeRuntimeSnapshot(true) } catch { /* snapshot is best-effort */ }
  bridge.notify(`⚠️ QQ 机器人掉线（${new Date().toLocaleTimeString('zh-CN', { hour12: false })}）`)
  for (const entry of bridge.sessions.values()) {
    if (entry.route.bot === socket) {
      bridge.sessions.delete(entry.key)
      bridge.agents.delete(entry.sessionId)
      entry.handle.agent.cancel({ kind: 'user' })
      void entry.handle.dispose()
    }
  }
  bridge.tryAutoHeal()
}

export function downloadMessageImagesForBridge({ bridge, message }) {
  return downloadMessageImagesService({
    message,
    imageDir: bridge.imageDir,
    config: bridge.config,
    downloadTo,
    extractGifFrame: (file) => bridge.extractGifFrame(file),
    imageBlocksFor: (files) => bridge.imageBlocksFor(files),
    debugLog,
  })
}

export function resolveJoinForBridge({ bridge, entry, approve, offline = false }) {
  return resolveJoinService({
    entry,
    approve,
    offline,
    trace: bridge.trace,
    server: bridge.server,
    gate: bridge.gate,
    joinGuard: bridge.joinGuard,
    debugLog,
  })
}

export function saveFaceToQqForBridge({ bridge, item }) {
  return saveFaceToQqService({
    item,
    dirWin: '\\\\wsl.localhost\\Ubuntu\\tmp\\qq-customface',
    server: bridge.server,
    faces: bridge.faces,
    mkdir: mkdirSync,
    writeFile: writeFileSync,
    readFile: readFileSync,
    debugLog,
  })
}

export function handleTodoForBridge({ bridge, message, arg }) {
  return handleTodoService({
    message,
    arg,
    todoDir: bridge.todoDir,
    routeKey: bridge.routeKey(message),
    safeReply: (m, t) => bridge.safeReply(m, t),
  })
}

export function runDailyReportForBridge({ bridge }) {
  return runDailyReportService({
    stopped: bridge.stopped,
    server: bridge.server,
    targets: () => bridge.dailyReportTargets(),
    config: bridge.config,
    trace: bridge.trace,
    ensureSession: (message) => bridge.ensureSession(message),
    statsStore: bridge.statsStore,
    loadMemoryLines: (chatKey) => bridge.loadMemoryLines(chatKey),
    handoff: (entry, message, payload) => bridge.handoff(entry, message, payload),
    debugLog,
  })
}

export function collectStickerForBridge({ bridge, message }) {
  return collectStickerService({
    message,
    faces: bridge.faces,
    stickerMsgLink: (id, name) => bridge.stickerMsgLink(id, name),
    debugLog,
    onCollected: (picked) => {
      bridge.lastStickerName = picked.name
      bridge.lastSticker = { name: picked.name, md5: picked.md5, file: picked.file, duplicate: picked.duplicate }
    },
  })
}

export function cancelReminderForBridge({ bridge, message, arg = '' }) {
  return cancelReminderService({
    message,
    arg,
    routeKey: bridge.routeKey(message),
    reminders: bridge.reminders,
    saveReminders: () => bridge.saveReminders(),
    safeReply: (m, t) => bridge.safeReply(m, t),
  })
}

export function endVoteForBridge({ bridge, message }) {
  return endVoteService({
    message,
    routeKey: (m) => bridge.routeKey(m),
    votes: bridge.votes,
    timers: bridge.timers,
    publishVote: (v) => bridge.publishVote(v),
    safeReply: (m, t) => bridge.safeReply(m, t),
  })
}

export function startVoteForBridge({ bridge, message, vc }) {
  return startVoteService({
    message,
    vc,
    config: bridge.config,
    votes: bridge.votes,
    timers: bridge.timers,
    routeKey: (m) => bridge.routeKey(m),
    safeReply: (m, text) => bridge.safeReply(m, text),
    publishVote: (vote) => bridge.publishVote(vote),
  })
}

export function handleJoinAnswerForBridge({ bridge, message, text }) {
  return handleJoinAnswerService({
    message,
    text,
    joinGuard: bridge.joinGuard,
    checkVerifyAnswer,
    resolveJoin: (entry, approve, opts) => bridge.resolveJoin(entry, approve, opts),
    safeReply: (m, t) => bridge.safeReply(m, t),
    notify: (t) => bridge.notify(t),
    approvalOffline: (m) => bridge.approvalOffline(m),
    debugLog,
  })
}

export function handleVerifyCommandForBridge({ bridge, message, cmd }) {
  return handleVerifyCommandService({
    message,
    cmd,
    joinGuard: bridge.joinGuard,
    resolveJoin: (entry, approve, opts) => bridge.resolveJoin(entry, approve, opts),
    safeReply: (m, t) => bridge.safeReply(m, t),
    trace: bridge.trace,
    approvalOffline: (m) => bridge.approvalOffline(m),
    formatPendingList,
  })
}

export function handleRecallNoticeForBridge({ bridge, notice }) {
  return handleRecallNoticeService({
    notice,
    config: bridge.config,
    recallCache: bridge.recallCache,
    recallLastAt: bridge.recallLastAt,
    gate: bridge.gate,
    server: bridge.server,
    formatRecallNotice,
    debugLog,
  })
}

export function backfillWorkspaceMembershipForBridge({ bridge }) {
  return backfillWorkspaceMembershipService({
    config: bridge.config,
    workspaceStore: bridge.workspaceStore,
    workspaceRuntime: bridge.workspaceRuntime,
    ensureMembership: (binding, sessionId, key, source) => bridge.ensureWorkspaceMembership(binding, sessionId, key, source),
  })
}

export function convertToMp3ForBridge({ bridge, wavFile }) {
  return new Promise((resolve, reject) => {
    const out = wavFile.replace(/\.wav$/i, '') + '.mp3'
    execFile(bridge.config.ffmpegPath || 'ffmpeg', ['-y', '-i', wavFile, '-codec:a', 'libmp3lame', '-q:a', '4', out], { timeout: 60_000 }, (error) => {
      if (error) { reject(error); return }
      try { unlinkSync(wavFile) } catch { /* best effort */ }
      resolve(out)
    })
  })
}
