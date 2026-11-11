// Apply core state produced by createCoreState.
export function applyCoreState(bridge, core) {
  bridge.reminderFile = core.reminderFile
  bridge.reminders = core.reminders
  bridge.timers = core.timers
  bridge.reminderRuntime = core.reminderRuntime
  bridge.rateLimiter = core.rateLimiter
  bridge.duplicateGuard = core.duplicateGuard
  bridge.personaFileCache = core.personaFileCache
  bridge.personaCorpusRuntime = core.personaCorpusRuntime
  bridge.votes = core.votes
  bridge.pendingKicks = core.pendingKicks
  bridge.pluginVersion = core.pluginVersion
  bridge.lastNotifyAt = core.lastNotifyAt
  bridge.quietRanges = core.quietRanges
  bridge.lastPokeAt = core.lastPokeAt
  bridge.genLastAt = core.genLastAt
  bridge.genDaily = core.genDaily
  bridge.broadcast = core.external.broadcast
  bridge.broadcastState = core.external.broadcastState
  bridge.webhook = core.external.webhook
  bridge.autoHealAt = []
  bridge.engagementRuntime = core.engagement
  bridge.reactions = core.engagement.reactions
  bridge.engageState = core.engagement.engageState
  bridge.engageSwitches = core.engagement.engageSwitches
  bridge.pokeQuota = core.engagement.pokeQuota
  bridge.emojiLikeQuota = core.engagement.emojiLikeQuota
  bridge.likeQuota = core.engagement.likeQuota
  bridge.markReadQuota = core.engagement.markReadQuota
  bridge.typingSent = core.engagement.typingSent
  bridge.recentTexts = core.engagement.recentTexts
  bridge.opsCounters = core.engagement.opsCounters
  bridge.opsState = core.engagement.opsState
  bridge.pendingKickBatch = core.engagement.pendingKickBatch
}
