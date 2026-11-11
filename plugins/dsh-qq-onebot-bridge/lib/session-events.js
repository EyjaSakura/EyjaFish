// 自动抽取自 bridge.js #onSessionEvent
import { existsSync, readFileSync, writeFileSync, appendFileSync, readdirSync, mkdirSync, copyFileSync, unlinkSync, statSync } from 'node:fs'
import { join, basename, dirname, extname } from 'node:path'
import { assistantText } from './shared-helpers.js'

export function onSessionEvent({ session, event, bridge, defineTool, debugLog }) {
  if (bridge.stopped) return
  // [本地补丁] 启动期 workspaceRegistry 未激活时把工作区回填挂起了，触发器挂在这里：
  // 这条监听是**全局**的，无论回合由 QQ 还是浏览器发起（浏览器复用同一个 live agent）
  // 都会经过；挂在 QQ 入站路径（#ensureSession）上会漏掉浏览器发起的回合 —— 实测踩到过。
  if (bridge.workspaceBackfillPending === true) {
    bridge.workspaceBackfillPending = false
    try {
      void bridge.backfillWorkspaceMembership().catch(() => {})
    } catch { /* 尽力而为，绝不影响事件处理 */ }
  }
  const sessionId = String(session.id)
  const entry = bridge.agents.get(sessionId)
  // 桥的 session/event 监听是全局的：宿主里其它会话（用户自己的、宿主内部的）
  // 也会走到这里。只有我们自己创建的 qq-* 会话才值得记录，否则就是假警报。
  const isBridgeSession = entry !== undefined || sessionId.startsWith('qq-')
  if (!isBridgeSession) {
    // [本地补丁] 不再完全静默：每个会话 id 记一次，便于排查
    // "handoff 子会话在跑、但输出没人发到 QQ" 这类问题。
    if (!(bridge.unknownSessionSeen instanceof Set)) bridge.unknownSessionSeen = new Set()
    if (bridge.unknownSessionSeen.size < 200 && !bridge.unknownSessionSeen.has(sessionId)) {
      bridge.unknownSessionSeen.add(sessionId)
      debugLog(`session/event from non-bridge session ${sessionId} (${event.type}) — 未注册，输出不会发到 QQ`)
    }
    return
  }
  if (event.type === 'turn/start') {
    debugLog(`turn/start turn=${event.data.turn}`)
    if (entry) {
      entry.turnStartedAt = Date.now()
      entry.turnActive = true
      // 这一回合是谁触发的：取队首（FIFO）。超过 15 分钟的陈旧记账直接丢弃，
      // 避免宿主某次没报 turn/start 时，很久以后误伤真人回合。
      const stale = Date.now() - 15 * 60_000
      while (entry.pendingTurns.length > 0 && entry.pendingTurns[0].at < stale) entry.pendingTurns.shift()
      entry.currentTurnInjected = entry.pendingTurns.shift()?.injected === true
      entry.turnSuppressedReply = false
    }
    bridge.trace?.event({
      id: entry?.lastTraceId, stage: 'agent', ok: true, chatKey: entry?.key, level: 'debug',
      data: { phase: 'turn-start', turn: event.data.turn, sessionId: entry?.sessionId },
    })
    return
  }
  if (event.type === 'turn/end') {
    debugLog(`turn/end reason=${JSON.stringify(event.data.reason)}`)
    const reason = event.data.reason
    const failed = reason && reason.kind === 'error'
    const errMsg = String(reason?.error?.message || '')
    if (failed && entry && /400|INVALID_REQUEST|context|too long/i.test(errMsg)) {
      bridge.forceRotate(entry.key)
      void bridge.replyTo(entry.route, '⚠️ 这个会话上下文太长了，接口拒了请求；我已经换成新会话，你把刚才那句再发一次就行。').catch(() => {})
      debugLog('[context-guard] rotated on API 400 for ' + entry.key)
      return
    }
    const ms = entry?.turnStartedAt ? Date.now() - entry.turnStartedAt : 0
    if (entry) {
      // 回合结束：清掉这一回合的临时状态（记账本身在 turn/start 时已经出队）
      entry.turnActive = false
      entry.currentTurnInjected = false
      entry.turnSuppressedReply = false
      // [inject-queue] 注入回合结束：冲刷排队的真人消息（落盘恢复）
      void bridge.flushDeferred(entry.key)

    }
    bridge.trace?.event({
      id: entry?.lastTraceId, stage: 'agent', ok: !failed, chatKey: entry?.key, ms,
      level: failed ? 'error' : 'debug',
      reason: failed ? `模型回合结束但报错：${reason?.error?.message ?? 'unknown'}` : '',
      data: { phase: 'turn-end', turn: event.data.turn, kind: reason?.kind ?? '' },
    })
    bridge.writeRuntimeSnapshot()
    return
  }
  if (event.type !== 'assistant/message') return
  if (entry === undefined) {
    // 会话已被机器人断开清理，或宿主重启后残留：这条回复无处可发。
    debugLog('assistant/message but no entry')
    bridge.trace?.event({
      id: '', stage: 'agent', ok: false, level: 'warn',
      reason: `收到没有归属会话的 assistant/message（session=${sessionId.slice(0, 12)}），回复被丢弃`,
    })
    return
  }
  const text = assistantText(event)
  debugLog(`assistant text len=${text.length}`)
  if (text === '') {
    bridge.trace?.event({ id: entry.lastTraceId, stage: 'agent', ok: false, chatKey: entry.key, level: 'warn', reason: '模型这一轮没有输出文本（可能只调用了工具）' })
    return
  }
  bridge.recordMemory(entry.key, 'assistant', text)
  entry.lastTurnAt = Date.now()
  // 注入回合的模型回复：默认整回合拦截，保证注入不会误发 QQ。
  // 显式 injectDryRun=false 时允许真实发送（只对测试号/测试群使用）。
  if (entry.currentTurnInjected === true && bridge.config.injectDryRun !== false) {
    // 一个回合可能有**多条** assistant/message（模型每步一条，用工具的回合必然多步），
    // 只拦第一条会把最终回答漏发出去。
    entry.turnSuppressedReply = true
    try { // [inject-reply-fallback] 她忘了调 douyin_send 时，把这句话兜底发到抖音
      const t = bridge.injectReplyTarget
      if (t && Date.now() - t.at < 10 * 60_000 && !(bridge.douyinSentAt && Date.now() - bridge.douyinSentAt < 5 * 60_000)) { // [no-double-reply]
        let body = String(text).replace(/\n+/g, ' ').trim()
        body = body.replace(/。/g, ' ').replace(/[!！]+/g, '口牙').replace(/[?？]+/g, '').replace(/\s+$/g, '').trim()
        if (body) {
          // [meta-narration] 括号旁白/状态标注不是对对方说的话，不转发
          const __isMeta = /^[（(]/.test(body) || /^(在看了|排上了|收到|稍等|回了|这条也|先看)/.test(body)
          if (__isMeta) {
            debugLog('[inject-reply-fallback] skipped meta narration: ' + body.slice(0, 40))
          } else {
          let __dup = false
          try { // [outbox-dedupe] 2 分钟内同样内容不重复发
            const lines = readFileSync('D:\\DSH\\qqbot\\douyin\\dm-outbox.jsonl', 'utf8').split('\n').filter(Boolean)
            const last = lines.length ? JSON.parse(lines[lines.length - 1]) : null
            if (last && last.peer === t.peer && last.text === body && Date.now() - (last.at || 0) < 120000) __dup = true
          } catch { /* ignore */ }
          if (__dup) { debugLog('[outbox-dedupe] skipped duplicate for ' + t.peer) }
          else appendFileSync('D:\\DSH\\qqbot\\douyin\\dm-outbox.jsonl', JSON.stringify({ at: Date.now(), peer: t.peer, text: body }) + '\n', 'utf8')
          debugLog('[inject-reply-fallback] forwarded to ' + t.peer + ': ' + body.slice(0, 40))
          bridge.injectReplyTarget = null
          }
        }
      }
    } catch { /* ignore */ }
    bridge.trace?.event({
      id: entry.lastTraceId, stage: 'inject', ok: true, chatKey: entry.key, level: 'info',
      reason: `注入回合的模型回复已被拦截（dry-run，未发送）：${text.slice(0, 120)}`,
      data: { suppressed: true, length: text.length },
    })
    debugLog(`injected turn reply suppressed (${text.length} chars)`)
    bridge.writeRuntimeSnapshot()
    return
  }
  void bridge.replyTo(entry.route, text, { traceId: entry.lastTraceId ?? '' }).then((sent) => {
    if (sent && bridge.config.ttsEnabled) void bridge.sendTts(entry.route, text)
  }).catch((error) => {
    debugLog(`reply failed: ${error.message}`)
    bridge.logger.error(`QQ reply failed: ${error.message}`)
    bridge.trace?.event({ id: entry.lastTraceId, stage: 'reply', ok: false, chatKey: entry.key, level: 'error', reason: `回复发送失败：${error.message}` })
  })
  bridge.writeRuntimeSnapshot()
}
