// 运行时快照里的功能开关：只暴露开关与计数，绝不泄露密钥。
// 纯函数，便于单测。

const KEYS = [
  'sessionMode', 'maxMessageLength', 'visionMode', 'visionToolName', 'provider', 'model',
  'sessionResumeEnabled', 'agentMediaToolsEnabled', 'fileSendMaxBytes', 'forwardLongReplies',
  'memoryEnabled', 'memoryMaxEntries', 'reminderEnabled', 'recurringReminderEnabled', 'reminderMaxPerChat',
  'quietHoursEnabled', 'quietHours', 'quietWeekendExempt', 'rateLimitEnabled', 'dedupEnabled',
  'keywordEnabled', 'fortuneEnabled', 'diceEnabled', 'pointsEnabled', 'gameEnabled', 'statsEnabled',
  'mcStatusEnabled', 'groupReadEnabled', 'dailyReportEnabled', 'dailyReportTime', 'dailyReportChats',
  'antiRecallEnabled', 'antiRecallInGroup', 'filterEnabled', 'filterAction', 'floodEnabled',
  'verifyEnabled', 'checkinEnabled', 'welcomeEnabled', 'pokeEnabled', 'voiceReadingEnabled',
  'imageGenEnabled', 'ttsEnabled', 'ttsProvider', 'sttEnabled', 'adminEnabled',
  'exportEnabled', 'fileTransferEnabled', 'notifyEnabled',
  'traceEnabled', 'traceLevel', 'traceMemorySize',
  'forwardExpandEnabled', 'forwardMaxNodes', 'forwardMaxChars',
  'memberQueryEnabled', 'memberListLimit', 'friendListEnabled',
  'historyQueryEnabled', 'historyQueryLimit', 'reactToolEnabled', 'leaveGroupEnabled',
  'ocrEnabled', 'ocrMaxImages', 'groupFileEnabled', 'groupFileDownloadEnabled',
  'groupFileListLimit', 'groupFileMaxBytes', 'albumEnabled',
  'historyArchiveEnabled', 'historyArchiveKeepDays', 'historySearchEnabled',
  'historySearchDays', 'historySearchLimit',
  'webhookEnabled', 'webhookPort', 'webhookRatePerMinute', 'webhookMaxBodyBytes',
  'broadcastEnabled', 'autoHealEnabled', 'autoHealCooldownSeconds', 'autoHealMaxPerHour',
  'engageEnabled', 'pokeBackEnabled', 'pokeCommandEnabled', 'pokePerHour',
  'typingEnabled', 'emojiLikeEnabled', 'emojiLikeId', 'emojiLikeMentionOnly', 'emojiLikePerHour',
  'reactionStatsEnabled', 'sendLikeEnabled', 'sendLikeTimes', 'sendLikePerDay',
  'markReadEnabled', 'markReadPerMinute',
  'groupOpsEnabled', 'nativeSignEnabled', 'opsReadEnabled', 'opsKickEnabled', 'opsKickBatchSize',
  'opsTodoEnabled', 'opsFileEnabled', 'opsAlbumUploadEnabled', 'opsProfileEnabled', 'opsPolicyEnabled',
  'opsReportEnabled', 'opsReportDays',
  'opsAdminEnabled', 'opsInvitePolicyEnabled', 'opsAddOptionEnabled',
  'requestSyncEnabled', 'requestSyncCount', 'adminWatchEnabled',
]

/**
 * @param {object} config 桥接配置
 * @param {{ reactions?: number, typing?: number, opsDays?: number, pendingKick?: number }} [counters]
 */
export function featureFlags(config = {}, counters = {}) {
  const flags = {}
  for (const key of KEYS) flags[key] = config[key]
  flags.verifyKeywordConfigured = Boolean(String(config.verifyKeyword ?? '').trim())
  flags.webhookSourceCount = Array.isArray(config.webhookSources) ? config.webhookSources.length : 0
  flags.broadcastJobCount = Array.isArray(config.broadcastJobs) ? config.broadcastJobs.length : 0
  flags.autoHealCommandConfigured = Boolean(String(config.autoHealCommand ?? '').trim())
  flags.reactionMessageCount = Number(counters.reactions) || 0
  flags.typingActiveCount = Number(counters.typing) || 0
  flags.opsCounterEntries = Number(counters.opsDays) || 0
  flags.pendingKickBatches = Number(counters.pendingKick) || 0
  flags.adminUsers = (config.adminUsers ?? []).length
  flags.allowUsers = (config.allowUsers ?? []).length
  flags.allowGroups = (config.allowGroups ?? []).length
  return flags
}
