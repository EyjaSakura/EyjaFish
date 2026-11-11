// /ocr command.
import { handleOcrCommand as handleOcrCommandService } from './ocr-command.js'
import { collectOcrCandidates, ocrImages } from './ocr.js'
import { downloadTo } from './download.js'
import { isAbsolute } from 'node:path'
import { existsSync } from 'node:fs'
import { debugLog } from '../core/debug-log.js'

export async function handleOcr({ bridge, message, text }) {
  return handleOcrCommandService({
    message,
    text,
    config: bridge.config,
    canRun: (m, cap) => bridge.canRun(m, cap),
    server: bridge.server,
    safeReply: (m, t) => bridge.safeReply(m, t),
    collectOcrCandidates,
    ocrImages,
    downloadTo,
    imageDir: bridge.imageDir,
    isAbsolute,
    existsSync,
    debugLog,
  })
}
