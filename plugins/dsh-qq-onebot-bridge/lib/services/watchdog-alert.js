// watchdog 事故补报：水位线落盘，再把新事故发给所有绑定聊天。
import { readFileSync, writeFileSync } from 'node:fs'

/** @param {any} args */
export async function reportWatchdogIncidents({
  config = {},
  server,
  incidentFile,
  stateFile,
  summarize,
  bindingTargets,
  syntheticMessage,
  roleOf,
  safeReply,
  trace,
  debugLog = () => {},
  now = Date.now(),
}) {
  if (config.watchdogAlertEnabled === false) return
  const socket = server.currentSocket()
  if (socket === undefined || socket === null) {
    debugLog('watchdog alert deferred: no bot socket yet')
    return
  }
  let raw = ''
  try { raw = readFileSync(incidentFile, 'utf8') } catch { return }
  let notifiedAt = 0
  try { notifiedAt = Number(JSON.parse(readFileSync(stateFile, 'utf8'))?.notifiedAt ?? 0) || 0 } catch { /* 首次运行 */ }
  const summary = summarize(raw, notifiedAt)
  if (summary.fresh.length === 0) return
  const { lastAt, downs, restarts, limited, lines } = summary
  try {
    writeFileSync(stateFile, JSON.stringify({ notifiedAt: lastAt, at: now() }), { mode: 0o600 })
  } catch (error) {
    debugLog(`watchdog alert state write failed: ${error.message}`)
  }
  if (summary.alertable !== true) return
  const text = lines.join('\n')
  let sent = 0
  for (const [key] of bindingTargets()) {
    const message = syntheticMessage(key)
    if (message === undefined) continue
    try { if (roleOf(message).guest === true) continue } catch { continue }
    try { await safeReply(message, text); sent += 1 } catch { /* 单个聊天失败不影响其它 */ }
  }
  debugLog(`watchdog alert: ${downs} down / ${restarts} restart / ${limited} limited -> sent ${sent} chat(s)`)
  trace?.event({
    id: '', stage: 'heal', ok: true, level: 'warn',
    reason: `watchdog 事故补报：掉线 ${downs} 次 / 自动重启 ${restarts} 次 / 限流 ${limited} 次（已发 ${sent} 个聊天）`,
    data: { downs, restarts, limited, sent },
  })
}
