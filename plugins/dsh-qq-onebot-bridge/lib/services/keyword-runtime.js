// Keyword auto-reply command + keyword image handling.
import { handleKeyword as handleKeywordService, keywordImage as keywordImageService } from './keyword-reply.js'
import { downloadTo } from './download.js'
import { debugLog } from '../core/debug-log.js'

export function createKeywordRuntime({ keywordStore, routeKey, recordMemory, safeReply, sendImageTo, routeOf, imageDir, cwd }) {
  async function handleKeyword(message, text) {
    return handleKeywordService({
      message,
      text,
      keywordStore,
      routeKey: (m) => routeKey(m),
      recordMemory: (k, role, t) => recordMemory(k, role, t),
      safeReply: (m, t) => safeReply(m, t),
      keywordImage: (image) => keywordImage(image),
      sendImage: (route, file) => sendImageTo(route, file),
      routeOf: (m) => routeOf(m),
      debugLog,
    })
  }

  async function keywordImage(image) {
    return keywordImageService({
      image,
      imageDir,
      cwd,
      downloadTo,
      now: Date.now(),
    })
  }

  return { handleKeyword, keywordImage }
}
