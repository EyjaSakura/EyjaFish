// Stage 0 memory seam: the host only knows recall/ingest, never memory-core.
/**
 * @param {{ bridge?: any, context?: any, timeoutMs?: number, debugLog?: (message: string) => void }} args
 */
export async function callMemoryRecall({ bridge, context, timeoutMs = 200, debugLog = () => {} } = {}) {
  if (!bridge || typeof bridge.dispatchFeature !== 'function') return null
  let timer
  try {
    const pending = Promise.resolve(bridge.dispatchFeature('memoryRecall', context))
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), Math.max(20, Number(timeoutMs) || 200))
    })
    const result = await Promise.race([pending, timeout])
    return result ?? null
  } catch (error) {
    debugLog(`[memory] recall failed: ${error?.message ?? error}`)
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * @param {{ bridge?: any, context?: any, debugLog?: (message: string) => void }} args
 */
export function callMemoryIngest({ bridge, context, debugLog = () => {} } = {}) {
  if (!bridge || typeof bridge.dispatchFeature !== 'function') return
  try {
    Promise.resolve(bridge.dispatchFeature('memoryIngest', context)).catch((error) => {
      debugLog(`[memory] ingest failed: ${error?.message ?? error}`)
    })
  } catch (error) {
    debugLog(`[memory] ingest failed: ${error?.message ?? error}`)
  }
}
