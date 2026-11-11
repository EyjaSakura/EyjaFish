// Injection window / dry-run suppression helpers.
import { debugLog } from '../core/debug-log.js'

export function createInjectionRuntime({ config, trace, injectWindows, sessions }) {
  function injectionSuppressed(chatKey) {
    if (config.injectDryRun === false || !chatKey) return false
    if (injectWindows.active(chatKey)) return true
    return sessions.get(chatKey)?.currentTurnInjected === true
  }

  function markSuppressed(chatKey, what, text = '', traceId = '') {
    trace?.event({
      id: traceId, stage: 'inject', ok: true, chatKey, level: 'info',
      reason: `注入回合的${what}已被拦截（dry-run，未发送）${text ? `：${String(text).slice(0, 120)}` : ''}`,
      data: { suppressed: true, chars: String(text ?? '').length },
    })
    debugLog(`injected outbound suppressed (${what}, ${String(text ?? '').length} chars)`)
  }

  function beginInjectWindow(chatKey) { injectWindows.begin(chatKey) }
  function endInjectWindow(chatKey) { injectWindows.end(chatKey) }

  function injectedTaskBlocked(record, what) {
    if (record?.injected !== true) return false
    if (config.injectDryRun === false) return false
    trace?.event({
      id: '', stage: 'inject', ok: true, level: 'info', chatKey: record.key ?? '',
      reason: `注入登记的${what}已被拦截（dry-run，未发送）`,
    })
    debugLog(`injected ${what} suppressed`)
    return true
  }

  return { injectionSuppressed, markSuppressed, beginInjectWindow, endInjectWindow, injectedTaskBlocked }
}
