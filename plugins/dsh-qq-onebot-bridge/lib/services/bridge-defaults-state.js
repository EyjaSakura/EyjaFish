// Apply bridge defaults to the instance (kept out of bridge.js).
import { createBridgeDefaults } from './bridge-defaults.js'

export function applyBridgeDefaults(bridge, config) {
  const d = createBridgeDefaults({ config })
  bridge.todoDir = d.todoDir
  bridge.ttsDir = d.ttsDir
  bridge.filesDir = d.filesDir
  bridge.exportsDir = d.exportsDir
  bridge.mediaDir = d.mediaDir
  bridge.checkinDir = d.checkinDir
  bridge.checkinStore = d.checkinStore
  bridge.injectGuardService = d.injectGuardService
  bridge.sessionTurnsStore = d.sessionTurnsStore
  bridge.gate = d.gate
  bridge.sentMessages = d.sentMessages
  bridge.keywordStore = d.keywordStore
  bridge.pointsStore = d.pointsStore
  bridge.games = d.games
  bridge.recallCache = d.recallCache
  bridge.recallLastAt = d.recallLastAt
  bridge.badWordsFile = d.badWordsFile
  bridge.badWordsCache = d.badWordsCache
  bridge.floodGuard = d.floodGuard
  bridge.joinGuard = d.joinGuard
  bridge.botAdminKnown = d.botAdminKnown
  bridge.botAdminKnownAt = d.botAdminKnownAt
  bridge.ttsNoteReason = d.ttsNoteReason
  bridge.ttsNotedAt = d.ttsNotedAt
  bridge.botNames = d.botNames
  bridge.botNamesLearned = d.botNamesLearned
  bridge.botNameLearnPromise = d.botNameLearnPromise
  bridge.botNameLearnFailed = d.botNameLearnFailed
  bridge.botOnline = d.botOnline
  bridge.botOnlineAt = d.botOnlineAt
  bridge.notifyConfigWarned = d.notifyConfigWarned
  bridge.statsStore = d.statsStore
  bridge.dailyReportStore = d.dailyReportStore
  return d
}
