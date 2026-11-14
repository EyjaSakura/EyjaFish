// feature-memory stage 1 adapter.
// Owns modes, status.json, notifications, and the host seam. SQLite/extraction
// stay behind memory-core; this file only calls its public API.
import { DEFAULT_STATUS_FILE, normalizeMode, readStatus, today, writeStatus } from './status.js'
import { notifyOwner as realNotifyOwner } from './notify.js'
import { appendShadowRecall, DEFAULT_SHADOW_LOG } from './shadow-log.mjs'

const CORE_URL = new URL('../../memory-core/index.mjs', import.meta.url).href

/**
 * @param {{
 *   statusFile?: string,
 *   loadCore?: () => Promise<any>,
 *   notify?: (args: { bridge?: any, text?: string }) => Promise<any>,
 *   now?: () => number,
 *   env?: any,
 *   debugLog?: (message: string) => void,
 *   shadowLogFile?: string
 * }} [options]
 */
export function createMemoryAdapter({
  statusFile = DEFAULT_STATUS_FILE,
  loadCore = () => import(CORE_URL),
  notify = realNotifyOwner,
  now = Date.now,
  env = process.env,
  debugLog = () => {},
  shadowLogFile = DEFAULT_SHADOW_LOG,
} = {}) {
  let db = null
  let coreModule = null

  async function core() {
    if (coreModule) return coreModule
    coreModule = await loadCore()
    return coreModule
  }

  function openDb(mod) {
    if (db) return db
    if (typeof mod?.openStore !== 'function') return null
    db = mod.openStore(mod.DEFAULT_DB)
    return db
  }

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
      await core()
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

  /** @param {{ bridge?: any, fallbackText?: string, key?: string, message?: any }} args */
  async function recall({ bridge, fallbackText = '', key = '', message = null } = {}) {
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
    let mod
    try {
      mod = await core()
    } catch (error) {
      status = await degrade(error?.message ?? String(error), bridge)
      return { mode: 'degraded', inject: false, text: fallbackText, source: 'fallback:recent' }
    }
    const mode = normalizeMode(status.mode, initialMode())
    const query = String(message?.text || message?.raw_message || '')
    let text = fallbackText
    try {
      const handle = openDb(mod)
      if (handle && typeof mod.recallText === 'function') {
        const recalled = mod.recallText(handle, { subject: key, query, limit: 8 })
        if (typeof recalled === 'string' && recalled !== '') text = recalled
      }
    } catch (error) {
      status = await degrade(error?.message ?? String(error), bridge)
      return { mode: 'degraded', inject: false, text: fallbackText, source: 'fallback:recent' }
    }
    const source = text === fallbackText ? 'stage2-shadow-empty' : 'stage2-shadow'
    if (mode === 'shadow' && !/^\s*【/.test(query)) {
      appendShadowRecall({
        mode, source, subject: key, query,
        text: text === fallbackText ? '' : text,
      }, shadowLogFile)
    }
    // Stage 2: shadow compares the candidate block but never injects it.
    return {
      mode,
      inject: false,
      text,
      source,
      stage: Number(mod?.STAGE) || 1,
    }
  }

  async function ingest(payload = {}) {
    const status = currentStatus()
    if (status.mode === 'off' || status.mode === 'degraded') {
      return { accepted: false, mode: status.mode, source: 'off-or-degraded' }
    }
    // The bridge object is a Cordis facade and cannot be JSON-serialized. Keep
    // it only for notification; never pass it into the pure core/queue.
    const bridge = payload.bridge
    const { bridge: _bridge, ...corePayload } = payload
    let mod
    try {
      mod = await core()
    } catch (error) {
      await degrade(error?.message ?? String(error), bridge)
      return { accepted: false, mode: 'degraded', source: 'fallback' }
    }
    try {
      const handle = openDb(mod)
      if (!handle || typeof mod.ingestTurn !== 'function') {
        return { accepted: false, mode: status.mode, source: 'stage0-noop', windowId: payload.windowId ?? '' }
      }
      const result = mod.ingestTurn(handle, corePayload)
      return { ...result, mode: status.mode, source: 'stage2' }
    } catch (error) {
      await degrade(error?.message ?? String(error), bridge)
      return { accepted: false, mode: 'degraded', source: 'fallback', error: String(error?.message ?? error) }
    }
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
