// Public façade methods moved out of bridge.js.
// They stay on QQBridge.prototype via Object.assign in bridge.js.
import { chatKeyOf as chatKeyOfService, routeKey as routeKeyService, routeOf as routeOfService } from '../core/routing.js'
/** @type {any} */
export const bridgeFacadeMethods = {
  maybeStartupGreet() {
    return this.proactiveRuntime.maybeStartupGreet()
  },
  maybeDouyinBrowse() {
    return this.proactiveRuntime.maybeDouyinBrowse()
  },
  resetStuckTurns() {
    return this.proactiveRuntime.resetStuckTurns()
  },
  setActivity(name) {
    return this.proactiveRuntime.setActivity(name)
  },
  maybeChooseActivity() {
    return this.proactiveRuntime.maybeChooseActivity()
  },
  async pollAnalyzeResults() {
    return this.proactiveRuntime.pollAnalyzeResults()
  },
  maybeDouyinSpark() {
    return this.proactiveRuntime.maybeDouyinSpark()
  },
  async pollDouyinInbox() {
    return this.proactiveRuntime.pollDouyinInbox()
  },
  clearStaleQueues() {
    return this.queueRuntime.clearStaleQueues()
  },
  queueUserMessage(key, message) { return this.queueRuntime.queueUserMessage(key, message) },
  async flushDeferred(key) { return this.queueRuntime.flushDeferred(key) },
  flushAllDeferred() { return this.queueRuntime.flushAllDeferred() },
  loadOutbox() { return this.queueRuntime.loadOutbox() },
  enqueueOutbox(key, route, text) { return this.queueRuntime.enqueueOutbox(key, route, text) },
  async flushOutbox() { return this.queueRuntime.flushOutbox() },
  linkLastSticker(chatKey, name) {
    return this.recentRuntime.linkLastSticker(chatKey, name)
  },
  pushRecentMsg(key, id, role, text) {
    return this.recentRuntime.pushRecentMsg(key, id, role, text)
  },
  recentBlock(key) {
    return this.recentRuntime.recentBlock(key)
  },
  rememberText(messageId, text) {
    return this.recentRuntime.rememberText(messageId, text)
  },
  notify(text) {
    return this.messagingRuntime.notify(text)
  },
  injectionSuppressed(chatKey) {
    return this.injectionRuntime.injectionSuppressed(chatKey)
  },
  markSuppressed(chatKey, what, text = '', traceId = '') {
    return this.injectionRuntime.markSuppressed(chatKey, what, text, traceId)
  },
  async replyTo(route, text, opts) {
    return this.messagingRuntime.replyTo(route, text, opts)
  },
  shouldForward(text, route, forceForward) {
    return this.messagingRuntime.shouldForward(text, route, forceForward)
  },
  async sendForwardCard(route, text) {
    return this.messagingRuntime.sendForwardCard(route, text)
  },
  async sendBusyNotice(message) {
    return this.messagingRuntime.sendBusyNotice(message)
  },
  rateLimited(key) { return this.rateLimiter.limited(key) },
  duplicate(message) { return this.duplicateGuard.isDuplicate(message) },
  saveEngageState() { return this.engagementRuntime.saveEngage() },
  sendRoots(role) {
    return this.sendRootsRuntime.sendRoots(role)
  },
  resolveSendPath(raw, role) {
    return this.sendRootsRuntime.resolveSendPath(raw, role)
  },
  async sendImageBuffer(route, buffer, caption = '') {
    return this.mediaSendRuntime.sendImageBuffer(route, buffer, caption)
  },
  async sendImageTo(route, file, caption = '') {
    return this.mediaSendRuntime.sendImageTo(route, file, caption)
  },
  async sendFileTo(route, file, name = '') {
    return this.mediaSendRuntime.sendFileTo(route, file, name)
  },
  ttsUsable() {
    return this.mediaSendRuntime.ttsUsable()
  },
  async sendVoiceTo(route, text) {
    return this.mediaSendRuntime.sendVoiceTo(route, text)
  },
  trackSent(chatKey, data) {
    return this.sentHistoryRuntime.trackSent(chatKey, data)
  },
  async recallRecent(chatKey, count = 1) {
    return this.sentHistoryRuntime.recallRecent(chatKey, count)
  },
  dryRunAck(data) {
    return Boolean(data) && typeof data === 'object' && data.dryRun === true
  },
  sendVoice(rt, segments) {
    return this.server.sendSegments(rt.bot, rt.messageType, rt.targetId, segments)
  },
  sendRecord(rt, file) {
    return this.server.sendSegments(rt.bot, rt.messageType, rt.targetId, [{ type: 'record', data: { file } }])
  },
  async notifyOwner(route, text) {
    return this.contactPolicyRuntime.notifyOwner(route, text)
  },
  contacts() {
    return this.contactPolicyRuntime.contacts()
  },
  routeKey(message) { return routeKeyService(message, this.config) },
  routeOf(message) { return routeOfService(message) },
  chatKeyOf(route) { return chatKeyOfService(route) },
  ownerQQ() {
    return this.contactPolicyRuntime.ownerQQ()
  },
  drawAllowed(subject) {
    return this.contactPolicyRuntime.drawAllowed(subject)
  },
  selfKindEnabled(kind) {
    return this.contactPolicyRuntime.selfKindEnabled(kind)
  }
}
