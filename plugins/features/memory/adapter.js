// feature-memory stage 0 adapter.
// Owns modes, status.json, notifications, and the host seam. It does NOT own
// SQLite or extraction; those stay behind memory-core in stage 1.
import { DEFAULT_STATUS_FILE, normalizeMode, readStatus, today, writeStatus } from './status.js'
import { notifyOwner as realNotifyOwner } from './notify.js'

const CORE_URL = new URL('../../memory-core/index.mjs', import.meta.url).href

/**
 * @param {{
 *   statusFile?: string,
 *   loadCore?: () => Promise<any>,
 *   notify?: (args: { bridge?: any, text?: string }) => Promise<any>,
 *   now?: () => number,
 *   env?: any,
 *   debugLog?: (message: string) => void
 * }} [options]
 */
export function createMemoryAdapter({
  statusFile = DEFAULT_STATUS_FILE,
  loadCore = () => import(CORE_URL),
  notify = realNotifyOwner,
  now = Date.now,
  env = process.env,
  debugLog = () => {},
} = {}) {
  function currentStatus() {
    const status = readStatus(statusFile)
    // An explicit env override applies only when there is no status file yet;
    // once status.json exists, it is authoritative for the adapter.
    if (!status.updatedAt && env.MEMORY_MODE) {
      status.mode = normalizeMode(env.MEMORY_MODE, 'shadow')
    }
    return status
  }

  function initialMode() {
    return normalizeMode(env.MEMORY_MODE, 'shadow')
  }

  async function sendOnce(status, key, text, bridge) {
    const day = today(now())
    if (status[key] === day) return status
    try {
      await notify({ bridge, text })
      status[key] = day
      writeStatus(status, statusFile)
      debugLog(`[memory] notified owner: ${text}`)
    } catch (error) {
      debugLog(`[memory] notify failed: ${error?.message ?? error}`)
      writeStatus(status, statusFile)
    }
    return status
  }

  async function degrade(reason, bridge) {
    const status = currentStatus()
    if (status.mode !== 'degraded') {
      status.mode = 'degraded'
      status.reason = String(reason ?? 'unknown')
      status.degradedAt = now()
      writeStatus(status, statusFile)
    }
    await sendOnce(status, 'lastNotifiedDate', `【记忆系统】已降级到旧路径：${status.reason}。小鲸鱼仍可聊天，记忆升级暂不生效。`, bridge)
    return status
  }

  async function recoverIfPossible(bridge) {
    const status = currentStatus()
    if (status.mode !== 'degraded') return status
    try {
      await loadCore()
    } catch {
      return status
    }
    status.mode = 'shadow'
    status.reason = ''
    status.recoveredAt = now()
    writeStatus(status, statusFile)
    await sendOnce(status, 'lastRecoveredNotifiedDate', '【记忆系统】已恢复，回到 shadow 观察模式。', bridge)
    return status
  }

  /** @param {{ bridge?: any, fallbackText?: string }} args */
  async function recall({ bridge, fallbackText = '' } = {}) {
    let status = currentStatus()
    if (status.mode === 'off') {
      return { mode: 'off', inject: false, text: '', source: 'off' }
    }
    if (status.mode === 'degraded') {
      status = await recoverIfPossible(bridge)
      if (status.mode === 'degraded') {
        await sendOnce(status, 'lastNotifiedDate', `【记忆系统】已降级到旧路径：${status.reason || 'unknown'}。`, bridge)
        return { mode: 'degraded', inject: false, text: fallbackText, source: 'fallback:recent' }
      }
    }
    try {
      await loadCore()
    } catch (error) {
      status = await degrade(error?.message ?? String(error), bridge)
      return { mode: 'degraded', inject: false, text: fallbackText, source: 'fallback:recent' }
    }
    const mode = normalizeMode(status.mode, initialMode())
    // Stage 0 intentionally does not inject the new path yet. The host keeps
    // the legacy block; this call only proves the seam and records the mode.
    return {
      mode,
      inject: false,
      text: fallbackText,
      source: mode === 'on' ? 'stage0-on-not-ready' : 'stage0-shadow',
      stage: 0,
    }
  }

  async function ingest(payload = {}) {
    const status = currentStatus()
    if (status.mode === 'off' || status.mode === 'degraded') {
      return { accepted: false, mode: status.mode, source: 'off-or-degraded' }
    }
    // Stage 1 will enqueue here. Stage 0 only proves the host seam.
    return { accepted: false, mode: status.mode, source: 'stage0-noop', windowId: payload.windowId ?? '' }
  }

  async function health() {
    const status = currentStatus()
    let core = 'not-loaded'
    try {
      const mod = await loadCore()
      core = mod?.VERSION ?? 'loaded'
    } catch (error) {
      core = `error: ${error?.message ?? error}`
    }
    return { mode: status.mode, status, core }
  }

  function setMode(mode) {
    const status = currentStatus()
    const next = normalizeMode(mode, 'degraded')
    status.mode = next
    status.reason = next === 'degraded' ? (status.reason || 'manual') : ''
    writeStatus(status, statusFile)
    return next
  }

  return { recall, ingest, health, setMode, currentStatus, degrade }
}

export const memoryAdapter = createMemoryAdapter()
