// Daily report timer.
import { debugLog } from '../core/debug-log.js'

export function scheduleDailyReport({ bridge }) {
  if (!bridge.config.dailyReportEnabled) return
  const [hhRaw, mmRaw] = String(bridge.config.dailyReportTime || '22:00').split(':')
  const hour = Math.min(23, Math.max(0, Number(hhRaw) || 22))
  const minute = Math.min(59, Math.max(0, Number(mmRaw) || 0))
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0)
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1)
  const delay = Math.min(next.getTime() - now.getTime(), 0x7fffffff)
  const timer = setTimeout(() => {
    bridge.timers.delete(timer)
    void bridge.runDailyReport()
    if (!bridge.stopped) scheduleDailyReport({ bridge })
  }, delay)
  if (typeof timer.unref === 'function') timer.unref()
  bridge.timers.add(timer)
  debugLog(`daily report scheduled for ${next.toLocaleString('zh-CN', { hour12: false })}`)
}
