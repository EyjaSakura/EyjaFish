// Retention sweep: image/archive/trash cleanup and the recurring timer.
import { pathOf } from '../paths.js'
import { pruneTrash } from './trash-prune.js'
import { cleanupImageDirs as cleanupImageDirsService, pruneTrashDirs } from './image-retention.js'
import { expiredFiles, moveToTrash } from '../store.js'
import { debugLog } from '../core/debug-log.js'

export function createRetentionRuntime({ config, archive, trace, imageDir, quoteDir, filesDir, ttsDir, timers, isStopped }) {
  function pruneArchive() {
    if (!archive) return { moved: [] }
    try {
      const trashDir = pathOf(config, 'trash')
      const result = archive.prune({ trashDir })
      if (result.moved.length > 0) {
        debugLog(`archive pruned: ${result.moved.length} file(s) moved to ${trashDir}`)
        trace?.event({
          id: '', level: 'info', module: 'bridge', stage: 'archive', ok: true,
          reason: `历史归档保留期清理：${result.moved.length} 个过期分片已移入回收目录（保留 ${config.historyArchiveKeepDays} 天）`,
        })
      }
      return result
    } catch (error) {
      debugLog(`archive prune failed: ${error.message}`)
      return { moved: [] }
    }
  }

  function cleanupImageDirs() {
    return cleanupImageDirsService({
      config,
      dirs: [imageDir, quoteDir, filesDir, ttsDir],
      pathOf,
      expiredFiles,
      moveToTrash,
      debugLog,
    })
  }

  function pruneTrashDirsRuntime() {
    return pruneTrashDirs({ config, pathOf, pruneTrash, trace, debugLog })
  }

  function runSweep(reason = 'startup') {
    try {
      const images = cleanupImageDirs()
      const arch = pruneArchive()
      const trash = pruneTrashDirsRuntime()
      debugLog(`retention sweep (${reason}): files moved=${images?.moved ?? 0}, archive shards moved=${arch?.moved?.length ?? 0}, trash buckets removed=${trash?.buckets ?? 0} (${trash?.files ?? 0} file(s))`)
    } catch (error) {
      debugLog(`retention sweep failed (${reason}): ${error.message}`)
    }
  }

  function startSweeper() {
    const hours = Math.max(1, Number(config.retentionSweepHours) || 24)
    const ms = Number(process.env.QQ_RETENTION_SWEEP_MS) > 0
      ? Number(process.env.QQ_RETENTION_SWEEP_MS)
      : hours * 3_600_000
    const timer = setInterval(() => {
      if (isStopped()) return
      runSweep('scheduled')
    }, ms)
    timers.add(timer)
    debugLog(`retention sweeper armed: every ${ms}ms (retentionSweepHours=${hours})`)
  }

  return { pruneArchive, cleanupImageDirs, pruneTrashDirs: pruneTrashDirsRuntime, runSweep, startSweeper }
}
