// Plain in-memory stores, guards, and small state used by the bridge.
import { ActionGate } from '../actions.js'
import { KeywordStore } from '../keywords.js'
import { PointsStore } from '../points.js'
import { RecallCache } from '../recall.js'
import { WordFilter, FloodGuard } from '../filter.js'
import { JoinGuard } from '../verify.js'
import { StatsStore } from '../stats.js'
import { JsonStore } from '../store.js'
import { CheckinStore } from '../checkin.js'
import { pathOf } from '../paths.js'

export function createBridgeDefaults({ config }) {
  return {
    todoDir: pathOf(config, 'todos'),
    ttsDir: pathOf(config, 'tts'),
    filesDir: pathOf(config, 'files'),
    exportsDir: pathOf(config, 'exports'),
    mediaDir: pathOf(config, 'media'),
    checkinDir: pathOf(config, 'checkin'),
    checkinStore: new CheckinStore(pathOf(config, 'checkin')),
    injectGuardService: null,
    sessionTurnsStore: null,
    gate: new ActionGate({
      auditFile: config.actionAuditEnabled === false ? '' : pathOf(config, 'actionsLog'),
      perMinute: config.actionRatePerMinute,
      perDay: config.actionRatePerDay,
    }),
    sentMessages: new Map(),
    keywordStore: new KeywordStore(config.keywordFile || pathOf(config, 'keywords')),
    pointsStore: new PointsStore(pathOf(config, 'points')),
    games: new Map(),
    recallCache: new RecallCache({
      maxPerChat: Math.max(5, Number(config.antiRecallCacheSize) || 50),
      maxAgeMs: Math.max(1, Number(config.antiRecallMaxAgeMinutes) || 120) * 60_000,
    }),
    recallLastAt: new Map(),
    badWordsFile: config.filterWordsFile || pathOf(config, 'badwords'),
    badWordsCache: { stamp: '', filter: new WordFilter({ words: [], whitelist: config.filterWhitelist ?? [] }) },
    floodGuard: new FloodGuard({
      windowSeconds: config.floodWindowSeconds,
      maxMessages: config.floodMaxMessages,
      muteSeconds: config.floodMuteSeconds,
      strikeLimit: config.floodStrikeLimit,
    }),
    joinGuard: new JoinGuard({
      timeoutSeconds: config.verifyTimeoutSeconds,
      maxPending: config.verifyMaxPending,
    }),
    botAdminKnown: new Map(),
    botAdminKnownAt: new Map(),
    ttsNoteReason: '',
    ttsNotedAt: 0,
    botNames: new Set((config.mentionAliases ?? []).map((name) => String(name).trim()).filter(Boolean)),
    botNamesLearned: false,
    botNameLearnPromise: null,
    botNameLearnFailed: false,
    botOnline: null,
    botOnlineAt: 0,
    notifyConfigWarned: false,
    statsStore: new StatsStore(pathOf(config, 'stats'), { keepDays: config.statsKeepDays }),
    dailyReportStore: new JsonStore(pathOf(config, 'dailyreport'), { fallback: { chats: [] } }),
  }
}