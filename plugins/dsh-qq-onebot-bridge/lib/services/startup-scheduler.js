// Startup timer schedule. Bridge supplies private callbacks; this module only
// owns the timer wiring and intervals.
import { debugLog } from '../core/debug-log.js'

export function scheduleBridgeTimers({ bridge, config, timers, globalTimers, callbacks }) {
  globalTimers ??= []
  for (const t of globalTimers) { try { clearInterval(t); clearTimeout(t) } catch { /* ignore */ } }
  const list = []
  const push = (timer) => { list.push(timer) }

  push(setInterval(() => void callbacks.flushOutbox().catch(() => {}), 60_000))
  push(setInterval(() => { void callbacks.maaNotifyTick().catch((e) => debugLog('[maa-notify] error: ' + (e && e.message))) }, 30_000))
  const qzoneMin = Math.max(3, Number(config.qzonePollMinutes) || 10)
  push(setInterval(() => void callbacks.pollQzoneComments().catch(() => {}), qzoneMin * 60_000))
  push(setInterval(() => void callbacks.maybeAutoPostQzone().catch(() => {}), 10 * 60_000))
  push(setTimeout(() => void callbacks.maybeAutoPostQzone().catch(() => {}), 90_000))
  push(setTimeout(() => callbacks.flushAllDeferred(), 20_000))
  push(setInterval(() => { try { callbacks.pollDouyinInbox() } catch (e) { debugLog('[douyin] poll error: ' + e.message) } }, 3000))
  push(setInterval(() => { try { callbacks.resetStuckTurns() } catch (e) { debugLog('[stuck-guard] error: ' + e.message) } }, 120_000))
  push(setInterval(() => { void callbacks.pollAnalyzeResults().catch((e) => debugLog('[async-analyze] error: ' + e.message)) }, 10_000))
  push(setTimeout(() => { void callbacks.pollAnalyzeResults().catch((e) => debugLog('[async-analyze] error: ' + e.message)) }, 8_000))
  push(setInterval(() => { try { callbacks.maybeChooseActivity() } catch (e) { debugLog('[activity] error: ' + e.message) } }, 600_000))
  push(setTimeout(() => { try { callbacks.maybeChooseActivity() } catch { } }, 45_000))
  push(setInterval(() => { try { callbacks.maybeDouyinSpark() } catch (e) { debugLog('[douyin-spark] error: ' + e.message) } }, 600_000))
  push(setTimeout(() => { try { callbacks.maybeDouyinSpark() } catch { } }, 30_000))
  push(setInterval(() => { try { callbacks.maybeDouyinBrowse() } catch (e) { debugLog('[douyin-browse] error: ' + e.message) } }, 600_000))
  push(setTimeout(() => { try { callbacks.maybeDouyinBrowse() } catch { } }, 60_000))
  push(setTimeout(() => void callbacks.pollQzoneComments().catch(() => {}), 60_000))

  callbacks.runRetentionSweep('startup')
  callbacks.startRetentionSweeper()
  callbacks.logDevGroups()
  callbacks.startVerifySweeper()
  callbacks.scheduleDailyReport()
  callbacks.startInjectPoll()
  callbacks.startExternalServices()
  bridge.writeRuntimeSnapshot(true)
  void callbacks.startSessionMaintenance()

  const heartbeat = setInterval(
    () => bridge.writeRuntimeSnapshot(true),
    Math.max(50, Number(bridge.runtimeHeartbeatMs) || 60_000),
  )
  if (typeof heartbeat.unref === 'function') heartbeat.unref()
  timers.add(heartbeat)

  return list
}
