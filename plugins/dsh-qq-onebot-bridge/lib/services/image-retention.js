// 图片/语音等文件保留期清理 + 回收站二次清理。
import { existsSync, readdirSync, statSync, rmSync } from 'node:fs'

/** @param {any} args */
export function cleanupImageDirs({ config = {}, dirs, pathOf, expiredFiles, moveToTrash, debugLog = () => {} }) {
  try {
    const retentionMs = Math.max(1, Number(config.imageRetentionDays) || 14) * 86_400_000
    const trash = config.imageTrashEnabled === false ? '' : (config.imageTrashDir || pathOf(config, 'trash'))
    let moved = 0
    for (const dir of dirs) {
      for (const file of expiredFiles(dir, retentionMs)) {
        if (trash) {
          if (moveToTrash(file, trash)) moved += 1
          else debugLog(`image retention: 无法移入回收目录，保留原文件 ${file}`)
        }
      }
    }
    if (moved > 0) debugLog(`image retention: ${moved} 个过期文件已移入 ${trash}（未永久删除）`)
    return { moved }
  } catch (error) {
    debugLog(`image retention cleanup failed: ${error.message}`)
    return { moved: 0 }
  }
}

/** @param {any} args */
export function pruneTrashDirs({ config = {}, pathOf, pruneTrash, trace, debugLog = () => {} }) {
  try {
    const keepDays = Math.max(1, Number(config.trashRetentionDays) || 30)
    const maxBytes = Math.max(0, Number(config.trashMaxBytes) || 0)
    const result = pruneTrash({
      dir: config.imageTrashDir || pathOf(config, 'trash'),
      keepDays,
      maxBytes,
      exists: existsSync,
      readdir: readdirSync,
      stat: statSync,
      rm: rmSync,
    })
    if (result.files > 0) {
      debugLog(`trash retention: 真删 ${result.buckets} 个过期日期桶 / ${result.files} 个文件 / ${Math.round(result.bytes / 1024)} KiB（保留 ${keepDays} 天，上限 ${maxBytes > 0 ? `${Math.round(maxBytes / 1024 / 1024)} MiB` : '不限'}）`)
      trace?.event({
        id: '', stage: 'archive', ok: true, level: 'info',
        reason: `回收站二次清理：真删 ${result.buckets} 个过期日期桶（${result.files} 个文件，回收 ${Math.round(result.bytes / 1024)} KiB；保留 ${keepDays} 天）`,
        data: { buckets: result.buckets, files: result.files, bytes: result.bytes, keepDays, maxBytes },
      })
    }
    return result
  } catch (error) {
    debugLog(`trash retention failed: ${error.message}`)
    return { buckets: 0, files: 0, bytes: 0 }
  }
}
