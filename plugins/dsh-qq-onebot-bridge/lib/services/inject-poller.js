// 注入队列轮询：先重试推迟注入，再消费 tailer 新增行。
/** @param {any} args */
export async function pollInjections({
  stopped,
  injecting,
  retryDeferred,
  injectTailer,
  parseInjectionLine,
  handleInjection,
  compactQueue,
  trace,
  config = {},
  debugLog = () => {},
  onConsumed = () => {},
}) {
  if (stopped || injecting) return
  try { await retryDeferred() } catch (error) { debugLog(`deferred inject retry failed: ${error.message}`) }
  let lines = []
  try {
    lines = injectTailer.poll()
  } catch (error) {
    debugLog(`inject poll failed: ${error.message}`)
    return
  }
  for (const line of lines) {
    if (line.trim() === '') continue
    onConsumed()
    try {
      const { kind, frame } = parseInjectionLine(line, { botQq: config.botQq })
      await handleInjection(kind, frame)
    } catch (error) {
      trace?.event({
        id: '', level: 'error', module: 'bridge', stage: 'inject', ok: false,
        reason: `注入失败：${error.message}`, data: { line: String(line).slice(0, 200) },
      })
      debugLog(`injection rejected: ${error.message}`)
    }
  }
  compactQueue()
}
