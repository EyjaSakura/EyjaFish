// 会话写权冲突：重试夺回，失败则拒绝 fork 并保留绑定。
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** @param {any} args */
export async function resolveOwnershipConflict({
  message,
  key,
  sessionId,
  error,
  isWriterHeld,
  config = {},
  resumeSession,
  bindSession,
  trace,
  logger,
  debugLog = () => {},
  sleep = defaultSleep,
}) {
  if (isWriterHeld(error) !== true) return undefined
  const attempts = Math.max(0, Math.trunc(Number(config.sessionClaimRetries ?? 3)))
  const gapMs = Math.max(50, Math.trunc(Number(config.sessionClaimRetryMs ?? 1500)))
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await sleep(gapMs)
    try {
      const entry = await resumeSession(message, key, sessionId)
      bindSession(key, entry.sessionId, 'reclaim')
      debugLog(`session reclaimed after retry ${attempt}: ${sessionId}`)
      logger?.info(`QQ bridge reclaimed session ${sessionId.slice(0, 8)} after ${attempt} retry(ies)`)
      trace?.event({
        id: '', stage: 'conflict', ok: true, chatKey: key, level: 'info',
        reason: `写权冲突后重试第 ${attempt} 次夺回 ${sessionId.slice(0, 12)}`,
        data: { sessionId, attempts: attempt, outcome: 'reclaimed' },
      })
      return entry
    } catch (retryError) {
      if (isWriterHeld(retryError) !== true) throw retryError
    }
  }
  debugLog(`session ${sessionId} writer-held; refusing to fork`)
  trace?.event({
    id: '', stage: 'conflict', ok: false, chatKey: key, level: 'warn',
    reason: `写权冲突：${sessionId.slice(0, 12)} 被别的客户端占用，重试 ${attempts} 次仍失败，拒绝 fork、保留绑定`,
    data: { sessionId, attempts, outcome: 'refused-fork', bindingKept: true },
  })
  const conflict = /** @type {Error & { dshSessionConflict?: boolean }} */ (new Error(
    `会话 ${sessionId.slice(0, 8)}… 正被另一个客户端（多半是浏览器里的 DSH 页面）占用，`
    + '我先不新建会话，以免把你的上下文拆散。请把那个页面切到别的会话或关掉，再发一条消息，我就继续在原会话里回你。',
  ))
  conflict.dshSessionConflict = true
  throw conflict
}
