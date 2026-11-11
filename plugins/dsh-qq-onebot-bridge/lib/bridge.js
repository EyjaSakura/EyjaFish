import { existsSync, readFileSync } from 'node:fs'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId as brandSessionId } from '@deepseek-ai/dsh-session'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { formatFeedItems, parseFeed } from './feed.js'
import { INPUT_STATUS_EVENT } from './engage.js'
import { generateImage } from './imagegen.js'
import { resolveToolSurface } from './tool-grants.js'
import { qzoneRequest as qzoneRequestService } from './services/qzone.js'

import { syntheticMessageForKey } from './core/chat-key.js'
import { startBridge as startBridgeRuntime, stopBridge as stopBridgeRuntime } from './services/startup-runtime.js'
import { noteWorkspaceRegistryOnce } from './services/workspace-registry-note.js'
import { reportDevGroups } from './services/dev-groups-report.js'
import { toolSurfaceSelfCheck, resolveSharedRoot } from './services/tool-surface-runtime.js'
import { applyRolePermissionForBridge, ensureRoleCwd, mountPresetForBridge } from './services/role-runtime.js'
import { resolveQuoted as resolveQuotedRuntime, groupImageAutoView as groupImageAutoViewRuntime } from './services/quote-runtime.js'
import { messageFromRoute } from './services/session-lookup.js'
import { loadWordFilter } from './services/word-filter-runtime.js'
import { sendHealthReport } from './services/health-runtime.js'
import { getAclPolicy } from './services/acl-policy-runtime.js'
import { registerJailedFsTools as registerJailedFsToolsRuntime } from './services/jailed-fs-runtime.js'
import { handleAlbum as handleAlbumRuntime } from './services/album-runtime.js'
import { handleOcr as handleOcrRuntime } from './services/ocr-runtime.js'
import { handleKickConfirm as handleKickConfirmRuntime } from './services/kick-runtime.js'
import { handlePoke as handlePokeRuntime } from './services/poke-runtime.js'
import { handleCheckin as handleCheckinRuntime, handleCheckinBoard as handleCheckinBoardRuntime } from './services/checkin-runtime.js'
import { textMentionName as textMentionNameRuntime, mentionLearnHint as mentionLearnHintRuntime } from './services/mention-runtime.js'
import { handleExport as handleExportRuntime } from './services/export-runtime.js'
import { scheduleDailyReport } from './services/daily-report-scheduler.js'
import { engagePassive as engagePassiveRuntime } from './services/passive-engage-runtime.js'
import { beginEventTrace as beginEventTraceRuntime } from './services/event-trace-runtime.js'
import { handleWelcome as handleWelcomeRuntime } from './services/welcome-runtime.js'
import { dispatchFeature } from './services/feature-dispatch-runtime.js'
import { actionErrorReason as actionErrorReasonRuntime, runOpsAction as runOpsActionRuntime } from './services/ops-action-runtime.js'
import { getFeatureFlags, getReplayHints, getDailyReportTargets } from './services/bridge-small-runtime.js'
import { notifyAdmin as notifyAdminRuntime } from './services/admin-notify-runtime.js'
import { writeRuntimeSnapshot as writeRuntimeSnapshotRuntime } from './services/runtime-snapshot-runtime.js'
import { handleContentFilter as handleContentFilterRuntime, handleHistorySearch as handleHistorySearchRuntime, handleIncomingVideo as handleIncomingVideoRuntime } from './services/command-misc-runtime.js'
import { handleImageGen as handleImageGenRuntime, sendTyping as sendTypingRuntime, startVerifySweeper as startVerifySweeperRuntime } from './services/misc-handler-runtime.js'
import { handleFriendList as handleFriendListRuntime, handleGroupRead as handleGroupReadRuntime } from './services/small-handlers-runtime.js'
import { startExternalServices as startExternalServicesRuntime, stopExternalServices as stopExternalServicesRuntime, tryAutoHeal as tryAutoHealRuntime, onTransferRequested as onTransferRequestedRuntime, handleBroadcastCommand as handleBroadcastCommandRuntime } from './services/misc-runtime.js'
import { handleDailyReportCommand as handleDailyReportCommandService } from './services/daily-report-command.js'
import { queryGroupMembers as queryGroupMembersRuntime, handleMemberQuery as handleMemberQueryService, handleGroupInfo as handleGroupInfoService } from './services/group-query-runtime.js'
import {
  registerSingTools as registerSingToolsService,
  registerMediaTools as registerMediaToolsService,
  registerQueryTools as registerQueryToolsService,
  registerContactsSection as registerContactsSectionService,
  registerOwnerTools as registerOwnerToolsService,
  registerSelfTools as registerSelfToolsService,
} from './services/feature-registration.js'

import { findWorkspaceEntity as findWorkspaceEntityService } from './services/workspace-membership.js'
import { resolveServiceMode as resolveServiceModeService } from './core/service-resolver.js'
import { debugLog } from './core/debug-log.js'

import { capabilityOffTools as capabilityOffToolsService } from './services/capability-off-tools.js'

import { formatBroadcastFeed as formatBroadcastFeedService } from './services/broadcast-feed.js'



export { isQuietTime } from './core/quiet-hours.js'
import { handoff as handoffToAgent } from './core/handoff.js'
import { stripSelfMention as stripSelfMentionCore } from './core/mention.js'

import { isAllowed } from './services/allow-policy.js'
import { beginMessageTrace } from './services/trace-runtime.js'
import { onServerEvent } from './services/server-events-runtime.js'
import { disposeSessionForBridge, rotateChat, rememberForRecall as rememberForRecallRuntime } from './services/session-command-runtime.js'
import { handleSummary as handleSummaryRuntime, listReminders as listRemindersRuntime } from './services/summary-runtime.js'
import { canRunForBridge, subjectOfChat as subjectOfChatRuntime, subjectOfSender as subjectOfSenderRuntime, writeGate as writeGateRuntime, chatLimits as chatLimitsRuntime } from './services/acl-runtime.js'
import { resolveOwnershipConflictForBridge } from './services/ownership-runtime.js'
import { initializeBridge } from './services/bridge-initialize.js'
import { bridgeFacadeMethods } from './services/bridge-facade.js'
import { markSeenForBridge } from './services/last-seen-runtime.js'
import { modelSelectionForBridge } from './services/model-selection-runtime.js'
import { pingBroadcastForBridge, saveBroadcastStateForBridge, reportWatchdogIncidentsForBridge, imageBlocksForBridge, identityConfigForBridge, findChatForSessionForBridge, extractGifFrameForBridge, cancelReminderByKeyForBridge, botAdminBlockedReasonForBridge, transcribeForBridge, maybeVoteForBridge, showVoteForBridge, registerFaceToolsForBridge, engageTargetFor, maybeAutoPostQzoneForBridge, onWebhookEventForBridge, onBotDisconnectForBridge, deliverExternalForBridge, pollQzoneCommentsForBridge, saveFaceToQqForBridge, resolveJoinForBridge, cancelReminderForBridge, endVoteForBridge, qzoneClientForBridge, downloadMessageImagesForBridge, registerScopedWebToolsForBridge, publishVoteForBridge, formatHandoffStatusForBridge, liveCapabilityBlockForBridge, expandForwardsForBridge, fetchVoiceAudioForBridge, handleTodoForBridge, runDailyReportForBridge, collectStickerForBridge, startVoteForBridge, handleJoinAnswerForBridge, handleRecallNoticeForBridge, handleVerifyCommandForBridge, convertToMp3ForBridge } from './services/bridge-command-adapters.js'
import { addReminderForBridge } from './services/reminder-add-runtime.js'
import { ensureWorkspaceMembershipForBridge } from './services/workspace-membership-adapters.js'
import { backfillWorkspaceMembershipForBridge } from './services/workspace-membership-adapters.js'
import { onSessionEvent } from './session-events.js'
import { applyToolSurface } from './tool-surface.js'
import { loadFeatures } from './feature-loader.js'
const __FEATURES = await loadFeatures('D:\\DSH\\plugins\\features', (m) => process.stderr.write(m + '\n'))
const __FEATURE_META = (() => {
  try {
    const file = 'D:\\DSH\\plugins\\features\\status.json'
    const rep = JSON.parse(readFileSync(file, 'utf8'))
    const dis = (rep.features || []).filter((f) => f.status === 'disabled')
    return { disabled: dis.map((f) => f.name), dataPaths: [...new Set(dis.flatMap((f) => f.dataPaths || []))] }
  } catch { return { disabled: [], dataPaths: [] } }
})()

import {
  handleKeywordAdmin as handleKeywordAdminService,
  handleFortune as handleFortuneService,
  handleDice as handleDiceService,
  handlePointsCommand as handlePointsCommandService2,
  awardMessagePoints as awardMessagePointsService,
  handleGameCommand as handleGameCommandService,
  handleActiveGame as handleActiveGameService2,
  recordStats as recordStatsService,
  handleStatsCommand as handleStatsCommandService,
  handleMcStatus as handleMcStatusService,
} from './services/chat-command-handlers.js'



const BOT_ADMIN_TTL_MS = 10 * 60_000

const DEFAULT_QQ_PERSONA = 'You are a helpful assistant.'

const FEATURE_TOOLS = new Set()
globalThis.__qqFeatureTools = FEATURE_TOOLS

// 模块加载即写一行：用来判断 DSH 是否对本插件做了热重载（无需重启也可上线）。
debugLog('bridge module loaded [websearch-v4]')

function healCommandLabel(command) {
  const text = String(command ?? '').trim()
  if (text === '') return '(空命令)'
  const parts = text.split(/\s+/)
  const first = parts[0].replace(/^["']|["']$/g, '')
  const base = first.split(/[\\/]/).pop() || first
  return parts.length > 1 ? `${base}（另有 ${parts.length - 1} 个参数）` : base
}

export class QQBridge {
  workspaceRuntime; sendRootsRuntime; aclCache; aclBootstrapNote; aclReader; aclSessionRuntime; retentionRuntime; sessionMaintenanceRuntime; runtimeFile; runtimeLastAt; runtimeHeartbeatMs; inbox; injectFile; injectTailer; injecting; injectWindows; deferredQueue; sessions; agents; creating; disposers; stopped; injectionRuntime; injectionRunner; queueRuntime; sessionLifecycleRuntime; proactiveRuntime; inboundRuntime; sessionBindRuntime; turnRuntime; sessionOpenRuntime;
  todoDir; ttsDir; filesDir; exportsDir; mediaDir; checkinDir; checkinStore; injectGuardService; sessionTurnsStore; gate; sentMessages; keywordStore; pointsStore; games; recallCache; recallLastAt; badWordsFile; badWordsCache; floodGuard; joinGuard; botAdminKnown; botAdminKnownAt; ttsNoteReason; ttsNotedAt; botNames; botNamesLearned; botNameLearnPromise; botNameLearnFailed; botOnline; botOnlineAt; notifyConfigWarned; statsStore; dailyReportStore;
  reminderFile; reminders; timers; reminderRuntime; rateLimiter; duplicateGuard; personaFileCache; personaCorpusRuntime; votes; pendingKicks; pluginVersion; lastNotifyAt; quietRanges; lastPokeAt; genLastAt; genDaily; broadcast; broadcastState; webhook; autoHealAt; engagementRuntime; reactions; engageState; engageSwitches; pokeQuota; emojiLikeQuota; likeQuota; markReadQuota; typingSent; recentTexts; opsCounters; opsState; pendingKickBatch;
  archive; sessionFile; sessionStore; workspaceFile; workspaceStore; dshHome; sessionRootDir; workspaceRegistryFile; watchdogIncidentFile; watchdogAlertStateFile; workspaceCache;
  ctx; config; server; logger; faces; quoteDir; imageDir; memoryDir; memoryRuntime; identityRuntime; contactPolicyRuntime;
  mediaSendRuntime; sentHistoryRuntime; recentRuntime; keywordRuntime; trace; messagingRuntime;

  constructor(ctx, config, server, logger) {
    initializeBridge({
      bridge: this, ctx, config, server, logger,
      defineTool, features: __FEATURES, featureMeta: __FEATURE_META, featureTools: FEATURE_TOOLS,
      defaultPersona: DEFAULT_QQ_PERSONA, brandSessionId,
      privates: new Proxy({}, { get: (_, name) => (...a) => this['priv_' + String(name)](...a) }),
    })
  }

  start() {
    startBridgeRuntime({ bridge: this, ctx: this.ctx, disposers: this.disposers })
  }

  onServer(event, handler) {
    return onServerEvent({ server: this.server, event, handler })
  }

  #pruneArchive() {
    return this.retentionRuntime.pruneArchive()
  }

  #cleanupImageDirs() {
    return this.retentionRuntime.cleanupImageDirs()
  }

  #pruneTrash() {
    return this.retentionRuntime.pruneTrashDirs()
  }

  runRetentionSweep(reason = 'startup') {
    return this.retentionRuntime.runSweep(reason)
  }

  startRetentionSweeper() {
    return this.retentionRuntime.startSweeper()
  }

  stop() {
    return stopBridgeRuntime({
      bridge: this,
      callbacks: { stopExternalServices: () => this.#stopExternalServices() },
    })
  }

  beginTrace(message) {
    return beginMessageTrace({ bridge: this, message })
  }

  beginEventTrace(kind, event) {
    return beginEventTraceRuntime({ bridge: this, kind, event })
  }

  startInjectPoll() {
    return this.injectionRunner.startInjectPoll()
  }

  async #pollInjections() {
    return this.injectionRunner.poll()
  }

  #compactInjectQueue() {
    return this.injectionRunner.compact()
  }

  #injectGuard(kind, frame) {
    return this.injectionRunner.guard(kind, frame)
  }

  async handleInjection(kind, frame) {
    return this.injectionRunner.handle(kind, frame)
  }

  async #retryDeferredInjections() {
    return this.injectionRunner.retryDeferred()
  }

  writeRuntimeSnapshot(force = false) {
    return writeRuntimeSnapshotRuntime({ bridge: this, force, ttl: BOT_ADMIN_TTL_MS })
  }

  featureFlags() { return this.#featureFlags() }
  replayHints() { return this.#replayHints() }

  #featureFlags() {
    return getFeatureFlags({ bridge: this, config: this.config })
  }

  #replayHints() { return getReplayHints({ config: this.config }) }

  allowed(message) {
    const pending = this.config.verifyEnabled ? this.joinGuard.list().map((entry) => entry.userId) : []
    return isAllowed(message, this.config, pending)
  }

  async onQqMessage(message) {
    return this.inboundRuntime.onQqMessage(message)
  }

  async onQqMessageInner(message) {
    return this.inboundRuntime.onQqMessageInner(message)
  }

  async safeReply(message, text) {
    return this.messagingRuntime.safeReply(message, text)
  }


  loadMemoryLines(key) {
    return this.memoryRuntime.loadMemoryLines(key)
  }

  sharedMemoryBlock(chatKey) {
    return this.memoryRuntime.sharedMemoryBlock(chatKey)
  }

  contactsInfo() {
    return this.memoryRuntime.contactsInfo()
  }

  setSelfState(activity, detail, withWhom) {
    return this.memoryRuntime.setSelfState(activity, detail, withWhom)
  }

  selfStateBlock(chatKey) {
    return this.memoryRuntime.selfStateBlock(chatKey)
  }

  recordMemory(key, role, text) {
    return this.memoryRuntime.recordMemory(key, role, text)
  }

  clearMemory(key) {
    return this.memoryRuntime.clearMemory(key)
  }

  saveReminders() { return this.#saveReminders() }
  scheduleReminder(rem) { return this.#scheduleReminder(rem) }

  #saveReminders() {
    this.reminderRuntime.save()
  }

  loadReminders() {
    this.reminderRuntime.load()
  }

  #scheduleReminder(rem) {
    this.reminderRuntime.schedule(rem)
  }

  #rescheduleRecurring(rem) {
    this.reminderRuntime.reschedule(rem)
  }

  async #deliverReminder(rem) {
    return this.reminderRuntime.deliver(rem)
  }

  async addReminder(message, parsed) {
    return addReminderForBridge({ bridge: this, message, parsed })
  }

  cancelReminderByKey(key, arg = '') {
    return this.priv_cancelReminderByKey(key, arg)
  }

  priv_cancelReminderByKey(key, arg = '') {
    return cancelReminderByKeyForBridge({ bridge: this, key, arg })
  }

  async cancelReminder(message, arg = '') {
    return cancelReminderForBridge({ bridge: this, message, arg })
  }

  async listReminders(message) {
    return listRemindersRuntime({ bridge: this, message })
  }

  mentionLearnHint() {
    return mentionLearnHintRuntime({ bridge: this })
  }

  actionErrorReason(error, label) {
    return actionErrorReasonRuntime(error, label)
  }

  async runOpsAction(message, label, run) {
    return runOpsActionRuntime({ bridge: this, message, label, run })
  }

  async textMentionName(message) {
    return textMentionNameRuntime({ bridge: this, message })
  }

  stripSelfMention(message, text) {
    return stripSelfMentionCore({ message, text, botQq: this.config.botQq, botNames: [...this.botNames] })
  }

  async sendTts(route, text) {
    return dispatchFeature(__FEATURES, 'sendTts', { route, text, defineTool, debugLog, bridge: this })
  }

  async synthVoiceFile(text) {
    return dispatchFeature(__FEATURES, 'synthVoiceFile', { text, defineTool, debugLog, bridge: this })
  }

  async handleVoiceReading(message, explicitText) {
    return dispatchFeature(__FEATURES, 'handleVoiceReading', { message, explicitText, defineTool, debugLog, bridge: this })
  }

  async handleHealth(message) {
    return sendHealthReport({ bridge: this, message })
  }

  async generateImage(prompt, options = {}) {
    return generateImage(this.config, prompt, options)
  }

  async handleImageGen(message, prompt) {
    return handleImageGenRuntime({ bridge: this, message, prompt })
  }

  convertToMp3(wavFile) {
    return convertToMp3ForBridge({ bridge: this, wavFile })
  }

  async handleExport(message) {
    return handleExportRuntime({ bridge: this, message })
  }

  async onNotice(notice) {
    return this.inboundRuntime.onNotice(notice)
  }

  rememberForRecall(message, text) {
    return rememberForRecallRuntime({ bridge: this, message, text })
  }

  async handleRecallNotice(notice) {
    return handleRecallNoticeForBridge({ bridge: this, notice })
  }

  async handleContentFilter(message, text) {
    return handleContentFilterRuntime({ bridge: this, message, text })
  }

  wordFilter() { return this.#wordFilter() }

  #wordFilter() {
    return loadWordFilter({
      file: this.badWordsFile,
      whitelist: this.config.filterWhitelist ?? [],
      cache: this.badWordsCache,
    })
  }

  async onRequest(request) {
    return this.inboundRuntime.onRequest(request)
  }

  async notifyAdmin(text) {
    return notifyAdminRuntime({ bridge: this, text })
  }

  async handleVerifyCommand(message, cmd) {
    return handleVerifyCommandForBridge({ bridge: this, message, cmd })
  }

  #offlineTurn(source) {
    return source?.__injected === true || source?.__replayed === true
  }

  approvalOffline(source) {
    return this.#offlineTurn(source) && this.config.injectDryRun !== false
  }

  async resolveJoin(entry, approve, { offline = false } = {}) {
    return resolveJoinForBridge({ bridge: this, entry, approve, offline })
  }

  async handleJoinAnswer(message, text) {
    return handleJoinAnswerForBridge({ bridge: this, message, text })
  }

  startVerifySweeper() {
    return startVerifySweeperRuntime({ bridge: this })
  }

  engageOn(key) {
    return this.config.engageEnabled === true && this.engageSwitches[key] === true
  }

  engageBlockedReason(what) {
    return `${what}未执行：注入/回放回合不写 QQ（injectDryRun=${this.config.injectDryRun === false ? 'false（真发模式）' : 'true（干跑）'}）`
  }

  engageWriteBlocked(target) {
    if (this.config.injectDryRun === false) return false
    return target?.__injected === true || target?.__replayed === true
  }

  async engagePassive(message, mark) {
    return engagePassiveRuntime({ bridge: this, message, mark })
  }



  async typingStart(message) {
    if (message.messageType !== 'private') return { ok: false, reason: '正在输入只支持私聊（NapCat 的 set_input_status 走 C2C 会话）' }
    const result = await this.#sendTyping(message, INPUT_STATUS_EVENT.typing)
    if (result.ok) this.typingSent.set(`u:${message.userId}`, Date.now())
    return result
  }

  async typingStopFor(route) {
    if (route?.messageType !== 'private') return { ok: false, reason: '正在输入只支持私聊' }
    const key = `u:${route.targetId}`
    const startedAt = this.typingSent.get(key)
    if (startedAt === undefined) return { ok: false, reason: '本次没有发过「正在输入」，无需撤销' }
    this.typingSent.delete(key)
    return this.#sendTyping({ messageType: 'private', userId: route.targetId, bot: route.bot }, INPUT_STATUS_EVENT.stop)
  }

  async #sendTyping(message, eventType) {
    return sendTypingRuntime({ bridge: this, message, eventType })
  }

  async handlePoke(notice) {
    return handlePokeRuntime({ bridge: this, notice })
  }

  async handleWelcome(notice) {
    return handleWelcomeRuntime({ bridge: this, notice })
  }

  async handleHelp(message) {
    return dispatchFeature(__FEATURES, 'handleHelp', { message, defineTool, debugLog, bridge: this })
  }

  async handleCheckin(message) {
    return handleCheckinRuntime({ bridge: this, message })
  }

  async handleCheckinBoard(message) {
    return handleCheckinBoardRuntime({ bridge: this, message })
  }

  async handlePrivateFiles(message) {
    return dispatchFeature(__FEATURES, 'handlePrivateFiles', { message, defineTool, debugLog, bridge: this })
  }

  isAdmin(message) {
    // [权限模型 2026-10-09] 旧接口保留为薄包装：语义 = "这个发言人有没有 admin 身份"。
    // 分配来源：adminUsers 白名单 + identity.map 里的 owner（owner 是 admin 的历史别名）。
    // 新代码请直接用 #canRun(message, <能力 id>)，按具体动作判权限。
    return this.canRun(message, 'admin.config').allowed
  }

  subjectOfChatFor(message) { return subjectOfChatRuntime(message) }
  subjectOfSenderFor(message) { return subjectOfSenderRuntime(message) }

  #subjectOfSender(message) { return subjectOfSenderRuntime(message) }
  #subjectOfChat(message) { return subjectOfChatRuntime(message) }

  toolSurface(route) {
    return resolveToolSurface(this.priv_aclPolicy(), this.#subjectOfChat(route))
  }

  priv_presetForSurface(role, surface) {
    return surface.requiresFullPreset
      ? (role.fullPreset || role.preset || 'qq-coding')
      : (role.readonlyPreset || 'qq-readonly')
  }

  writeGate(route, capabilityId) {
    return writeGateRuntime({ bridge: this, route, capabilityId })
  }

  chatLimits(route, keys) { return chatLimitsRuntime({ bridge: this, route, keys }) }

  priv_aclPolicy() {
    return getAclPolicy({ cache: this.aclCache, config: this.config, aclReader: () => this.aclReader() })
  }

  aclPolicy() { return this.priv_aclPolicy() }
  sharedRoot(policy = null) { return this.#sharedRoot(policy) }

  canRun(message, capabilityId, options = {}) {
    return canRunForBridge({ bridge: this, message, capabilityId, options })
  }

  async handleSummary(message) {
    return handleSummaryRuntime({ bridge: this, message })
  }

  async startVote(message, vc) {
    return startVoteForBridge({ bridge: this, message, vc })
  }

  async showVote(message) {
    return showVoteForBridge({ bridge: this, message })
  }

  async endVote(message) {
    return endVoteForBridge({ bridge: this, message })
  }

  async publishVote(vote) { return this.#publishVote(vote) }

  async #publishVote(vote) {
    return publishVoteForBridge({ bridge: this, vote })
  }

  async maybeVote(message) {
    return maybeVoteForBridge({ bridge: this, message })
  }

  async handleTodo(message, arg) {
    return handleTodoForBridge({ bridge: this, message, arg })
  }

  async handleAdminCommand(message, cmd, arg) {
    return dispatchFeature(__FEATURES, 'handleAdminCommand', { message, cmd, arg, defineTool, debugLog, bridge: this })
  }

  async handleKickConfirm(message, word) {
    return handleKickConfirmRuntime({ bridge: this, message, word })
  }

  async rotate(message) {
    return rotateChat({ bridge: this, message })
  }

  async priv_disposeSession(key) {
    return disposeSessionForBridge({ bridge: this, key })
  }

  async ensureSession(message) {
    return this.sessionOpenRuntime.ensureSession(message)
  }

  async #openSession(message, key) {
    return this.sessionOpenRuntime.openSession(message, key)
  }

  workspaceBinding(key) {
    return this.workspaceRuntime.workspaceBinding(key)
  }

  #setWorkspaceBinding(key, binding) {
    return this.workspaceRuntime.setWorkspaceBinding(key, binding)
  }

  #clearWorkspaceBinding(key) {
    return this.workspaceRuntime.clearWorkspaceBinding(key)
  }

  setWorkspaceBinding(key, binding) { return this.#setWorkspaceBinding(key, binding) }
  rememberSession(key, sessionId) { return this.#rememberSession(key, sessionId) }
  ensureWorkspaceMembership(binding, sessionId, key = '', source = '') { return this.#ensureWorkspaceMembership(binding, sessionId, key, source) }

  canSwitchWorkspace(message) {
    return this.workspaceRuntime.canSwitchWorkspace(message)
  }

  #readWorkspaceRegistry() {
    return this.workspaceRuntime.readWorkspaceRegistry()
  }

  #matchWorkspace(arg, list) {
    return this.workspaceRuntime.matchWorkspace(arg, list)
  }

  #findSessionDir(sessionId) {
    return this.workspaceRuntime.findSessionDir(sessionId)
  }

  #workspaceSessions(ws) {
    return this.workspaceRuntime.workspaceSessions(ws)
  }

  #workspaceSessionBusy(sessionId) {
    return this.workspaceRuntime.workspaceSessionBusy(sessionId)
  }

  #formatWorkspaceList(key, list) {
    return this.workspaceRuntime.formatWorkspaceList(key, list)
  }

  async handleWorkspaceCommand(message, text) {
    return this.workspaceRuntime.handleWorkspaceCommand(message, text)
  }

  async priv_openWorkspaceSession(message, key, binding) {
    return this.workspaceRuntime.openWorkspaceSession(message, key, binding)
  }

  #messageFromRoute(route) {
    return messageFromRoute(route)
  }

  findChatForSessionById(sessionId) { return this.#findChatForSession(sessionId) }
  createSessionFor(message, key, opts) { return this.priv_createSession(message, key, opts) }

  #findChatForSession(sessionId) {
    return findChatForSessionForBridge({ bridge: this, sessionId })
  }

  async onTransferRequested(payload) {
    return onTransferRequestedRuntime({ bridge: this, payload })
  }

  priv_syntheticMessageForKey(key) {
    let bot = false
    try { bot = this.server.currentSocket() ?? false } catch { /* 启动早期没有连接 */ }
    return syntheticMessageForKey(key, bot)
  }

  bindSessionFor(key, sessionId, source = 'open') { return this.priv_bindSession(key, sessionId, source) }

  priv_bindSession(key, sessionId, source = 'open') {
    return this.sessionBindRuntime.bind(key, sessionId, source)
  }

  resolveServiceFor(name, ctx = this.ctx) { return this.#resolveService(name, ctx) }

  #resolveService(name, ctx = this.ctx) {
    return this.#resolveServiceMode(name, ctx).service
  }

  #resolveServiceMode(name, ctx = this.ctx, activeOnly = false) {
    return resolveServiceModeService({ ctx, name, activeOnly })
  }

  resolveWorkspaceRegistryFor() { return this.#resolveWorkspaceRegistry() }
  noteWorkspaceRegistryOnceFor(registry) { return this.#noteWorkspaceRegistryOnce(registry) }

  #resolveWorkspaceRegistry() {
    const { service, via } = this.#resolveServiceMode('workspaceRegistry', this.ctx, true)
    this.workspaceRegistryVia = via
    return service
  }

  async #findWorkspaceEntity(registry, path) {
    return findWorkspaceEntityService({ registry, path, debugLog })
  }

  async #ensureWorkspaceMembership(binding, sessionId, key = '', source = '') {
    return ensureWorkspaceMembershipForBridge({ bridge: this, binding, sessionId, key, source })
  }

  #noteWorkspaceRegistryOnce(registry) {
    return noteWorkspaceRegistryOnce({ bridge: this, registry })
  }

  async backfillWorkspaceMembership() {
    return backfillWorkspaceMembershipForBridge({ bridge: this })
  }

  formatHandoffStatus(key) {
    return formatHandoffStatusForBridge({ bridge: this, key })
  }

  isWriterHeldFor(error) { return this.priv_isWriterHeld(error) }

  priv_isWriterHeld(error) {
    const name = String(error?.name ?? '')
    const text = String(error?.message ?? error ?? '')
    return name === 'SessionAlreadyOwnedError'
      || /already owned by an active write handle/i.test(text)
      || /session\/writer-held/i.test(text)
  }

  async priv_resolveOwnershipConflict(message, key, sessionId, error) {
    return resolveOwnershipConflictForBridge({ bridge: this, message, key, sessionId, error })
  }

  #readHeaderAt(dir) {
    return this.sessionMaintenanceRuntime.readHeaderAt(dir)
  }

  async #reconcileSessions() {
    return this.sessionMaintenanceRuntime.reconcileSessions()
  }

  bindingTargetsFor() { return this.#bindingTargets() }

  #bindingTargets() {
    return this.sessionMaintenanceRuntime.bindingTargets()
  }

  async startSessionMaintenance() {
    return this.sessionMaintenanceRuntime.startSessionMaintenance()
  }

  async #preclaimSessions() {
    return this.sessionMaintenanceRuntime.preclaimSessions()
  }

  storedSessionIdFor(key) { return this.priv_storedSessionId(key) }

  priv_storedSessionId(key) {
    return this.sessionMaintenanceRuntime.storedSessionId(key)
  }

  #rememberSession(key, sessionId) {
    return this.sessionMaintenanceRuntime.rememberSession(key, sessionId)
  }

  countTurn(message, entry) {
    return this.turnRuntime.countTurn(message, entry)
  }

  forceRotate(key) {
    this.turnRuntime.forceRotate(key)
    debugLog('[context-guard] rotated session for ' + key)
  }

  priv_forgetSession(key) {
    try {
      this.sessionStore.mutate((data) => { delete data[key] })
    } catch { /* best effort */ }
  }

  forgetSession(key) { return this.priv_forgetSession(key) }
  async disposeSessionByKey(key) { return this.priv_disposeSession(key) }

  #identityConfig() {
    return identityConfigForBridge({ bridge: this })
  }

  roleOf(message) {
    return this.#identityConfig().roleFor(message)
  }

  logDevGroups() {
    return reportDevGroups({
      config: this.config,
      logger: this.logger,
      identityConfig: () => this.#identityConfig(),
    })
  }

  priv_ensureRoleCwd(role) {
    return ensureRoleCwd({ role, logger: this.logger })
  }

  priv_applyRolePermission(handle, role) {
    return applyRolePermissionForBridge({ bridge: this, handle, role })
  }

  async priv_mountPreset(agentCtx, presetId, where) {
    return mountPresetForBridge({ bridge: this, agentCtx, presetId, where })
  }

  async applyToolSurface(agentCtx, route, key, role, surface) {
    return applyToolSurface({
      agentCtx, route, key, role, surface,
      defineTool,
      debugLog,
      bridge: this})
  }

  toolSurfaceSelfCheck(agentCtx, surface, key) {
    return toolSurfaceSelfCheck(agentCtx, surface, key)
  }

  #sharedRoot(policy = null) {
    return resolveSharedRoot({ config: this.config, policy })
  }

  async registerJailedFsTools(agentCtx, role, key, surface = null) {
    return registerJailedFsToolsRuntime({ bridge: this, agentCtx, role, key, surface })
  }

  registerMemoryTools(agentCtx, key) {
    return dispatchFeature(__FEATURES, 'registerMemoryTools', { defineTool, agentCtx, key, debugLog, bridge: this.priv_bridgeApi({}) })
  }

  async registerScopedWebTools(agentCtx, key) {
    return registerScopedWebToolsForBridge({ bridge: this, agentCtx, key, defineTool })
  }

  async priv_createSession(message, key, opts = {}) {
    return this.sessionLifecycleRuntime.create(message, key, opts)
  }

  async resumeSessionFor(message, key, sessionId) { return this.priv_resumeSession(message, key, sessionId) }

  async priv_resumeSession(message, key, sessionId) {
    return this.sessionLifecycleRuntime.resume(message, key, sessionId)
  }

  priv_registerSession(key, route, handle, opts = {}) {
    return this.sessionLifecycleRuntime.register(key, route, handle, opts)
  }

  async #installSession(agentCtx, route, key, opts) {
    return this.sessionLifecycleRuntime.install(agentCtx, route, key, opts)
  }

  personaEnabled() {
    return this.personaCorpusRuntime.personaEnabled()
  }

  #resolvePersona(role, key) {
    return this.personaCorpusRuntime.resolvePersona(role, key)
  }

  registerPersonaSection(agentCtx, key, role) {
    return this.personaCorpusRuntime.registerPersonaSection(agentCtx, key, role)
  }

  registerCorpusSection(agentCtx, key, subject) {
    return this.personaCorpusRuntime.registerCorpusSection(agentCtx, key, subject)
  }

  #resolveCorpusFor(subject) {
    return this.personaCorpusRuntime.resolveCorpusFor(subject)
  }

  priv_recordAclSession(entry, surface, kind = 'created') {
    return this.aclSessionRuntime.record(entry, surface, kind)
  }

  registerFaceTools(agentCtx, route) {
    return registerFaceToolsForBridge({ bridge: this, agentCtx, route, defineTool })
  }

  priv_featureApi() {
    return this
  }

  bridgeApi() { return this.priv_bridgeApi({}) }
  dispatchFeature(name, ctx) { return dispatchFeature(__FEATURES, name, ctx) }

  priv_bridgeApi(privates) {
    const self = this
    return new Proxy({}, {
      get(_t, prop) {
        if (privates && Object.prototype.hasOwnProperty.call(privates, prop)) return privates[prop]
        const v = self[prop]
        return typeof v === 'function' ? v.bind(self) : v
      },
      set(_t, prop, value) { self[prop] = value; return true },
      has(_t, prop) { return Object.prototype.hasOwnProperty.call(privates, prop) || prop in self },
    })
  }

  registerSingTools(agentCtx, route, key) {
    return registerSingToolsService({ features: __FEATURES, defineTool, agentCtx, route, key, bridge: this })
  }

  registerMediaTools(agentCtx, route, key, role) {
    return registerMediaToolsService({ features: __FEATURES, defineTool, agentCtx, route, key, role, bridge: this })
  }

  registerQueryTools(agentCtx, route, key, role) {
    return registerQueryToolsService({ features: __FEATURES, defineTool, agentCtx, route, key, role, bridgeApi: (p) => this.priv_bridgeApi(p) })
  }

  visionOn(message) {
    if (this.config.visionEnabled === false) return false
    return this.sendRootsRuntime.visionOn(message)
  }

  capabilityOffTools(surface) {
    return capabilityOffToolsService({
      config: this.config || {},
      surface,
      exists: existsSync,
      readFile: (file) => readFileSync(file, 'utf8'),
    })
  }

  liveCapabilityBlock(surface, exec) {
    return liveCapabilityBlockForBridge({ bridge: this, surface, exec })
  }

  identityAll() {
    return this.identityRuntime.identityAll()
  }

  identitySave(obj) {
    return this.identityRuntime.identitySave(obj)
  }

  identityBegin(uid, name = '') {
    return this.identityRuntime.identityBegin(uid, name)
  }

  identityClear(uid) {
    return this.identityRuntime.identityClear(uid)
  }

  async proactiveIdentityAsk() {
    return this.identityRuntime.proactiveIdentityAsk()
  }

  registerIdentitySection(agentCtx, role) {
    return this.identityRuntime.registerIdentitySection(agentCtx, role)
  }

  #callIdentityFeature(hook, agentCtx, route, key, role) {
    return this.identityRuntime.callIdentityFeature(hook, agentCtx, route, key, role, this)
  }

  registerIdentityTools(agentCtx, route, key, role) {
    return this.#callIdentityFeature('registerIdentityTools', agentCtx, route, key, role)
  }

  registerDouyinTools(agentCtx, route, key, role) {
    return this.#callIdentityFeature('registerDouyinTools', agentCtx, route, key, role)
  }

  registerPvzTools(agentCtx, route, key, role) {
    return this.#callIdentityFeature('registerPvzTools', agentCtx, route, key, role)
  }

  registerArkTools(agentCtx, route, key, role) {
    return this.#callIdentityFeature('registerArkTools', agentCtx, route, key, role)
  }

  registerContactsSection(agentCtx) {
    return registerContactsSectionService({
      agentCtx,
      config: this.config,
      contacts: /** @type {any} */ (this).contacts(),
      ownerQQ: /** @type {any} */ (this).ownerQQ(),
    })
  }

  registerOwnerTools(agentCtx, route, key, role) {
    return registerOwnerToolsService({ features: __FEATURES, defineTool, agentCtx, route, key, role, bridge: this })
  }

  registerSelfTools(agentCtx, route, key, role) {
    return registerSelfToolsService({ features: __FEATURES, defineTool, agentCtx, route, key, role, bridge: this })
  }

  async #prepareImageForSend(file) {
    return this.mediaSendRuntime.prepareImageForSend(file)
  }

  async handleKeyword(message, text) {
    return this.keywordRuntime.handleKeyword(message, text)
  }

  async #keywordImage(image) {
    return this.keywordRuntime.keywordImage(image)
  }

  async handleKeywordAdmin(message, cmd) {
    return handleKeywordAdminService(this, message, cmd)
  }

  async handleFortune(message, text) {
    return handleFortuneService(this, message, text)
  }

  async handleDice(message, text) {
    return handleDiceService(this, message, text)
  }

  async handlePointsCommand(message, text) {
    return handlePointsCommandService2(this, message, text)
  }

  awardMessagePoints(message) {
    return awardMessagePointsService(this, message)
  }

  async handleGameCommand(message, text) {
    return handleGameCommandService(this, message, text)
  }

  async handleActiveGame(message, text) {
    return handleActiveGameService2(this, message, text)
  }

  recordStats(message) {
    return recordStatsService(this, message)
  }

  async handleStatsCommand(message, text) {
    return handleStatsCommandService(this, message, text)
  }

  async handleMcStatus(message, text) {
    return handleMcStatusService(this, message, text)
  }

  async handleDailyReportCommand(message, text) {
    return handleDailyReportCommandService({ bridge: this, message, text })
  }

  async queryGroupMembers(groupId, query) {
    return this.#queryGroupMembers(groupId, query)
  }

  async #queryGroupMembers(groupId, query) {
    return queryGroupMembersRuntime(this, groupId, query)
  }

  async handleMemberQuery(message, text) {
    return handleMemberQueryService(this, message, text)
  }

  async handleGroupInfo(message, text) {
    return handleGroupInfoService(this, message, text)
  }

  async handleFriendList(message, text) {
    return handleFriendListRuntime({ bridge: this, message, text })
  }

  async handleHistorySearch(message, text) {
    return handleHistorySearchRuntime({ bridge: this, message, text })
  }

  async handleOcr(message, text) {
    return handleOcrRuntime({ bridge: this, message, text })
  }

  async handleGroupFiles(message, text) {
    return dispatchFeature(__FEATURES, 'handleGroupFiles', { message, text, defineTool, debugLog, bridge: this })
  }

  async handleAlbum(message, text) {
    return handleAlbumRuntime({ bridge: this, message, text })
  }

  async handleGroupRead(message, text) {
    return handleGroupReadRuntime({ bridge: this, message, text })
  }

  scheduleDailyReport() {
    return scheduleDailyReport({ bridge: this })
  }

  runDailyReport() { return this.#runDailyReport() }

  #dailyReportTargets() {
    return getDailyReportTargets({ config: this.config, store: this.dailyReportStore })
  }

  async #runDailyReport() {
    return runDailyReportForBridge({ bridge: this })
  }

  dailyReportTargets() { return this.#dailyReportTargets() }

  priv_modelSelection() {
    return modelSelectionForBridge({ bridge: this })
  }

  async saveFaceToQq(item) {
    return saveFaceToQqForBridge({ bridge: this, item })
  }

  async collectSticker(message) {
    return collectStickerForBridge({ bridge: this, message })
  }

  async handleIncomingVideo(message) {
    return handleIncomingVideoRuntime({ bridge: this, message, defineTool })
  }

  markSeen(key) {
    return markSeenForBridge({ bridge: this, key })
  }

  async backfillRecent() { return } // [backfill-off] 该版本没有公开 action API，补拉保持关闭（死代码已清理）

  async resolveQuoted(message) {
    return resolveQuotedRuntime({
      bridge: this,
      message,
      extractGifFrame: (file) => this.#extractGifFrame(file),
      imageBlocksFor: (files) => this.#imageBlocksFor(files),
    })
  }

  groupImageAutoView(message) {
    return groupImageAutoViewRuntime({ config: this.config, message })
  }

  async downloadMessageImages(message) {
    return downloadMessageImagesForBridge({ bridge: this, message })
  }

  extractGifFrame(file) { return this.#extractGifFrame(file) }
  imageBlocksFor(files) { return this.#imageBlocksFor(files) }

  #extractGifFrame(file) {
    return extractGifFrameForBridge({ bridge: this, file })
  }

  async #imageBlocksFor(files) {
    return imageBlocksForBridge({ bridge: this, files })
  }

  async expandForwards(message) {
    return expandForwardsForBridge({ bridge: this, message })
  }

  async handleVoice(message) {
    return dispatchFeature(__FEATURES, 'handleVoice', { message, defineTool, debugLog, bridge: this })
  }

  async fetchVoiceAudio(message, record) {
    return fetchVoiceAudioForBridge({ bridge: this, message, record })
  }

  async transcribe(audio) {
    return transcribeForBridge({ bridge: this, audio })
  }

  onSessionEvent(session, event) {
    onSessionEvent({
      session, event,
      defineTool,
      debugLog,
      bridge: this})
  }

  onBotDisconnect(socket) {
    return onBotDisconnectForBridge({ bridge: this, socket })
  }

  saveBroadcastState() { return this.priv_saveBroadcastState() }

  priv_saveBroadcastState() {
    return saveBroadcastStateForBridge({ bridge: this })
  }

  startExternalServices() {
    return startExternalServicesRuntime({ bridge: this })
  }

  #stopExternalServices() {
    return stopExternalServicesRuntime({ bridge: this })
  }

  countOps(kind, count = 1) {
    if (this.config.groupOpsEnabled !== true || this.config.opsReportEnabled !== true) return
    this.opsCounters.bump(kind, count)
    this.engagementRuntime.saveOps()
  }

  routeFromChatKeyFor(chatKey) { return this.#routeFromChatKey(chatKey) }

  #routeFromChatKey(chatKey) {
    const matched = /^([gu]):(\d{4,12})$/.exec(String(chatKey ?? '').trim())
    if (!matched) return null
    return matched[1] === 'g'
      ? { messageType: 'group', targetId: Number(matched[2]) }
      : { messageType: 'private', targetId: Number(matched[2]) }
  }

  async deliverExternal(chatKey, text, stage) {
    return deliverExternalForBridge({ bridge: this, chatKey, text, stage })
  }

  async priv_onWebhookEvent({ source, payload }) {
    return onWebhookEventForBridge({ bridge: this, source, payload })
  }

  async priv_pingBroadcast(address) {
    return pingBroadcastForBridge({ bridge: this, address })
  }

  async handleBroadcastCommand(message, text) {
    return handleBroadcastCommandRuntime({ bridge: this, message, text })
  }

  async handleEngageCommand(message, text) {
    return dispatchFeature(__FEATURES, 'handleEngageCommand', { message, text, defineTool, debugLog, bridge: this })
  }

  engageTarget(message, raw) {
    return engageTargetFor({ bridge: this, message, raw })
  }

  async handleOpsCommand(message, text) {
    return dispatchFeature(__FEATURES, 'handleOpsCommand', { message, text, defineTool, debugLog, bridge: this })
  }

  botAdminBlockedReason(groupId) {
    return botAdminBlockedReasonForBridge({ bridge: this, groupId })
  }

  tryAutoHeal() {
    return this.#tryAutoHeal()
  }

  priv_formatBroadcastFeed(xml, job) {
    return formatBroadcastFeedService({ xml, job, parseFeed, formatFeedItems })
  }

  injectedTaskBlockedFor(record, what) {
    return this.priv_injectedTaskBlocked(record, what)
  }

  #tryAutoHeal() {
    return tryAutoHealRuntime({ bridge: this, healCommandLabel })
  }

  async reportWatchdogIncidents() {
    return reportWatchdogIncidentsForBridge({ bridge: this })
  }

  async #reply(message, text) {
    return this.messagingRuntime.reply(message, text)
  }

  priv_beginInjectWindow(chatKey) { this.injectionRuntime.beginInjectWindow(chatKey) }
  priv_endInjectWindow(chatKey) { this.injectionRuntime.endInjectWindow(chatKey) }

  handoff(entry, message, payload) {
    return handoffToAgent({ entry, message, payload, trace: this.trace, createUserMessage })
  }

  priv_injectedTaskBlocked(record, what) {
    return this.injectionRuntime.injectedTaskBlocked(record, what)
  }

  async maaNotifyTick() {
    return this.proactiveRuntime.maaNotifyTick()
  }

  stickerMsgLink(messageId, name) { return this.#stickerMsgLink(messageId, name) }

  #stickerMsgLink(messageId, name) {
    return this.recentRuntime.stickerMsgLink(messageId, name)
  }

  #deferredFile() { return this.queueRuntime.deferredFile() }
  #loadDeferred() { return this.queueRuntime.loadDeferred() }
  #saveOutbox() { return this.queueRuntime.saveOutbox() }

  async qzoneRequest(url, init = {}, tries = 3) {
    return qzoneRequestService(url, init, tries, { debugLog })
  }

  #qzoneClient() {
    return qzoneClientForBridge({ bridge: this })
  }

  async qzoneFetchList(limit = 5) { return this.#qzoneClient().fetchList(limit) }

  async pollQzoneComments() {
    return pollQzoneCommentsForBridge({ bridge: this })
  }

  async maybeAutoPostQzone() {
    return maybeAutoPostQzoneForBridge({ bridge: this })
  }

}

Object.assign(QQBridge.prototype, bridgeFacadeMethods)
