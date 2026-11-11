// 启动占位：对已绑定会话做一次续接尝试（失败只记 trace）。
/** @param {any} args */
export async function preclaimSessions({
  config = {},
  bindingTargets,
  syntheticMessageForKey,
  roleOf,
  resumeSession,
  bindSession,
  logger,
  trace,
  isWriterHeld,
  debugLog = () => {},
}) {
  if (config.preclaimSessions === false) return
  if (config.sessionResumeEnabled === false) return
  const targets = bindingTargets()
  for (const [key, sessionId] of targets) {
    const message = syntheticMessageForKey(key)
    if (message === undefined) continue
    try {
      if (roleOf(message).guest === true) continue
      const entry = await resumeSession(message, key, sessionId)
      bindSession(key, entry.sessionId, 'preclaim')
      debugLog(`preclaim resumed ${entry.sessionId} for ${key}`)
      logger?.info(`QQ bridge preclaimed session ${entry.sessionId.slice(0, 8)} for ${key}`)
      trace?.event({
        id: '', stage: 'preclaim', ok: true, chatKey: key, level: 'info',
        reason: `启动占位续接 ${entry.sessionId.slice(0, 12)}`,
        data: { sessionId: entry.sessionId },
      })
    } catch (error) {
      debugLog(`preclaim skipped ${sessionId} for ${key}: ${error.message}`)
      trace?.event({
        id: '', stage: 'preclaim', ok: false, chatKey: key, level: 'warn',
        reason: `启动占位跳过 ${sessionId.slice(0, 12)}：${error.message}`,
        data: { sessionId, writerHeld: isWriterHeld(error) },
      })
    }
  }
}
