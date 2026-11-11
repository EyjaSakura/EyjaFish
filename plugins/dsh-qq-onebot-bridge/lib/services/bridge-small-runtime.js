// Small read-only policy views.
import { featureFlags } from './feature-flags.js'
import { replayHints } from './replay-hints.js'
import { pickReportTargets } from '../stats.js'

export function getFeatureFlags({ bridge, config }) {
  return featureFlags(config, {
    reactions: bridge.reactions.size,
    typing: bridge.typingSent.size,
    opsDays: bridge.opsCounters.days.size,
    pendingKick: bridge.pendingKickBatch.size,
  })
}

export function getReplayHints({ config }) {
  return replayHints(config)
}

export function getDailyReportTargets({ config, store }) {
  return pickReportTargets({
    configured: config.dailyReportChats ?? [],
    optIn: store.read()?.chats ?? [],
    allowGroups: config.allowGroups ?? [],
  })
}
