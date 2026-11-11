// Passive engagement (read receipts / emoji likes / poke back).
import { engagePassive as engagePassiveService } from './engage-passive.js'

export async function engagePassive({ bridge, message, mark }) {
  return engagePassiveService({
    message,
    mark,
    config: bridge.config,
    engageOn: (name) => bridge.engageOn(name),
    engageWriteBlocked: (m) => bridge.engageWriteBlocked(m),
    engageBlockedReason: (what) => bridge.engageBlockedReason(what),
    markReadQuota: bridge.markReadQuota,
    emojiLikeQuota: bridge.emojiLikeQuota,
    gate: bridge.gate,
    server: bridge.server,
    saveEngageState: () => bridge.saveEngageState(),
  })
}
