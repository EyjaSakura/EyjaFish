// 处理 DSH 的 context-handoff 交接请求：认领、建新会话、注入摘要、通知。
/** @param {any} args */
export async function onTransferRequested({
  config = {},
  payload,
  findChatForSession,
  roleOf,
  emit,
  workspaceBinding,
  createSession,
  handoff,
  replyTo,
  routeOf,
  logger,
  trace,
  debugLog = () => {},
}) {
  if (config.claimSessionTransfer === false) return
  if (payload === null || typeof payload !== 'object') return
  const fromSessionId = typeof payload.fromSessionId === 'string' ? payload.fromSessionId : ''
  if (fromSessionId === '') return
  const target = findChatForSession(fromSessionId)
  if (target === undefined) return
  const { key, message } = target
  if (roleOf(message).guest === true) {
    debugLog(`transfer refused (guest chat): ${fromSessionId} for ${key}`)
    return
  }
  const by = `qq-bridge:${key}`
  try {
    emit('context-handoff/claimed', { fromSessionId, by })
  } catch (error) {
    debugLog(`transfer claim emit failed: ${error.message}`)
    trace?.event({
      id: '', stage: 'transfer', ok: false, chatKey: key, level: 'error',
      reason: `交接认领广播失败：${error.message}`, data: { from: fromSessionId },
    })
    return
  }
  trace?.event({
    id: '', stage: 'transfer', ok: true, chatKey: key, level: 'info',
    reason: `认领交接 ${fromSessionId.slice(0, 12)}（consumer）`,
    data: { from: fromSessionId, by, mode: 'consumer' },
  })
  try {
    const binding = workspaceBinding(key)
    const cwd = typeof payload.cwd === 'string' && payload.cwd !== ''
      ? payload.cwd
      : (binding?.path ?? '')
    const next = await createSession(message, key, cwd === '' ? { parentSession: fromSessionId } : { cwd, parentSession: fromSessionId })
    const digest = typeof payload.digest === 'string' ? payload.digest : ''
    if (digest !== '') {
      handoff(next, null, {
        content: [{ type: 'text', text: digest }],
        source: { kind: 'user' },
      })
    }
    emit('context-handoff/committed', { fromSessionId, toSessionId: next.sessionId, by, mode: 'consumer-created' })
    trace?.event({
      id: '', stage: 'transfer', ok: true, chatKey: key, level: 'info',
      reason: `交接完成 ${fromSessionId.slice(0, 12)} -> ${next.sessionId.slice(0, 12)}`,
      data: { from: fromSessionId, to: next.sessionId, by, mode: 'consumer-created', digestChars: digest.length },
    })
    debugLog(`transfer committed ${fromSessionId} -> ${next.sessionId} for ${key}`)
    logger?.info(`QQ bridge accepted handoff ${fromSessionId.slice(0, 8)} -> ${next.sessionId.slice(0, 8)} for ${key}`)
    await replyTo(routeOf(message), `♻️ 上下文已交接到新会话（${next.sessionId.slice(0, 8)}…），下面继续在这个聊天里回你。`)
  } catch (error) {
    debugLog(`transfer failed for ${fromSessionId}: ${error.message}`)
    trace?.event({
      id: '', stage: 'transfer', ok: false, chatKey: key, level: 'error',
      reason: `交接失败 ${fromSessionId.slice(0, 12)}：${error.message}`,
      data: { from: fromSessionId, by, error: String(error?.message ?? error) },
    })
    try {
      emit('context-handoff/aborted', { fromSessionId, by, error: String(error?.message ?? error) })
    } catch { /* 广播失败不影响主流程 */ }
  }
}
