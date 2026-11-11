// Quote/sticker/image handling for one inbound message.
import { resolveQuoted as resolveQuotedService } from './quoted-message.js'
import { extractQuoteParts } from './quoted-content.js'
import { downloadTo } from './download.js'
import { debugLog } from '../core/debug-log.js'

export async function resolveQuoted({ bridge, message, extractGifFrame, imageBlocksFor }) {
  return resolveQuotedService({
    message,
    config: bridge.config,
    server: bridge.server,
    quoteDir: bridge.quoteDir,
    stickerMsgMap: bridge.stickerMsgMap,
    setQuoteState: (state) => {
      if (state.images) { bridge.lastQuotedImages = state.images; bridge.lastQuotedAt = state.at }
      if (state.stickerName !== undefined) bridge.lastQuotedStickerName = state.stickerName
    },
    extractQuoteParts,
    downloadTo,
    extractGifFrame: (file) => extractGifFrame(file),
    imageBlocksFor: (files) => imageBlocksFor(files),
    fetchVoiceAudio: (m, record) => bridge.fetchVoiceAudio(m, record),
    transcribe: (audio) => bridge.transcribe(audio),
    debugLog,
  })
}

export function groupImageAutoView({ config, message }) {
  if (config.groupImageView === false) return false
  if (message?.messageType !== 'group') return false
  if (message.atMe === true) return true
  return String(message.textMentionName ?? '') !== ''
}
