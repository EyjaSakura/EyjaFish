// Engagement/group-ops state: reaction stats, quotas, switches, counters, and
// their persistence. Optional features are off unless config enables them.
import { JsonStore } from '../store.js'
import { ReactionStats, EngageQuota } from '../engage.js'
import { OpsCounters } from '../ops.js'
import { pathOf } from '../paths.js'
import { debugLog } from '../core/debug-log.js'

export function createEngagementRuntime({ config }) {
  const reactions = new ReactionStats()
  let engageState = null
  const engageSwitches = {
    pokeBackEnabled: config.pokeBackEnabled === true,
    pokeCommandEnabled: config.pokeCommandEnabled === true,
    typingEnabled: config.typingEnabled === true,
    emojiLikeEnabled: config.emojiLikeEnabled === true,
    reactionStatsEnabled: config.reactionStatsEnabled === true,
    sendLikeEnabled: config.sendLikeEnabled === true,
    markReadEnabled: config.markReadEnabled === true,
  }
  if (config.engageEnabled === true) {
    engageState = new JsonStore(
      config.reactionStatsFile || pathOf(config, 'engage'),
      { fallback: {} },
    )
  }
  const pokeQuota = new EngageQuota({ perHour: config.pokePerHour })
  const emojiLikeQuota = new EngageQuota({ perHour: config.emojiLikePerHour })
  const likeQuota = new EngageQuota({ perDay: config.sendLikePerDay })
  const markReadQuota = new EngageQuota({ perMinute: config.markReadPerMinute })
  const typingSent = new Map()
  const recentTexts = new Map()
  const opsCounters = new OpsCounters({ maxDays: 30 })
  let opsState = null
  if (config.groupOpsEnabled === true) {
    opsState = new JsonStore(
      config.opsCountersFile || pathOf(config, 'ops'),
      { fallback: {} },
    )
  }
  const pendingKickBatch = new Map()

  function loadEngage() {
    if (!engageState) return
    try {
      const data = engageState.read() ?? {}
      const restored = reactions.restore(data.reactions ?? null)
      pokeQuota?.restore?.(data.pokeQuota ?? null)
      emojiLikeQuota?.restore?.(data.emojiLikeQuota ?? null)
      likeQuota?.restore?.(data.likeQuota ?? null)
      if (restored > 0) debugLog(`engage state restored: ${restored} messages`)
    } catch (error) {
      debugLog(`engage state load failed: ${error.message}`)
    }
  }

  function saveEngage() {
    if (!engageState) return
    try {
      engageState.write({
        version: 1,
        reactions: reactions.snapshot(),
        pokeQuota: pokeQuota.snapshot(),
        emojiLikeQuota: emojiLikeQuota.snapshot(),
        likeQuota: likeQuota.snapshot(),
      })
    } catch (error) {
      debugLog(`engage state save failed: ${error.message}`)
    }
  }

  function loadOps() {
    if (!opsState) return
    try {
      const data = opsState.read() ?? {}
      const loaded = opsCounters.restore(data.counters ?? null)
      if (loaded > 0) debugLog(`ops counters restored: ${loaded} entries`)
    } catch (error) {
      debugLog(`ops state load failed: ${error.message}`)
    }
  }

  function saveOps() {
    if (!opsState) return
    try {
      opsState.write({ version: 1, counters: opsCounters.snapshot() })
    } catch (error) {
      debugLog(`ops state save failed: ${error.message}`)
    }
  }

  if (opsState) loadOps()
  loadEngage()

  return {
    reactions,
    engageState,
    engageSwitches,
    pokeQuota,
    emojiLikeQuota,
    likeQuota,
    markReadQuota,
    typingSent,
    recentTexts,
    opsCounters,
    opsState,
    pendingKickBatch,
    loadEngage,
    saveEngage,
    loadOps,
    saveOps,
  }
}
