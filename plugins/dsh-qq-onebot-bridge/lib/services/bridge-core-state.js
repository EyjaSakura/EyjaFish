// Reminder/persona/guards/external/engagement state.
import { readFileSync } from 'node:fs'
import { pathOf } from '../paths.js'
import { parseQuietRanges } from '../core/quiet-hours.js'
import { RateLimiter, DuplicateGuard } from './message-guards.js'
import { createReminderRuntime } from './reminder-runtime.js'
import { createPersonaCorpusRuntime } from './persona-corpus-runtime.js'
import { createExternalSetup } from './external-setup.js'
import { createEngagementRuntime } from './engagement-runtime.js'
import { debugLog } from '../core/debug-log.js'

export function createCoreState({ bridge, config, logger, defaultPersona, callbacks }) {
  const reminderFile = pathOf(config, 'reminders')
  const reminders = new Map()
  const timers = new Set()
  const reminderRuntime = createReminderRuntime({
    file: reminderFile,
    reminders,
    timers,
    server: bridge.server,
    logger,
    debugLog,
    injectedBlocked: (rem, label) => callbacks.injectedTaskBlocked(rem, label),
  })
  const personaFileCache = new Map()
  const personaCorpusRuntime = createPersonaCorpusRuntime({
    config,
    logger,
    personaFileCache,
    getAclPolicy: () => callbacks.getAclPolicy(),
    defaultPersona,
  })
  let pluginVersion = '?'
  try { pluginVersion = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version } catch { /* keep ? */ }
  const external = createExternalSetup({
    config,
    logger,
    deliverExternal: (chat, text, stage) => bridge.deliverExternal(chat, text, stage),
    saveBroadcastState: () => callbacks.saveBroadcastState(),
    pingMc: (address) => callbacks.pingBroadcast(address),
    formatFeed: (xml, job) => callbacks.formatBroadcastFeed(xml, job),
    onWebhookEvent: (event) => callbacks.onWebhookEvent(event),
  })
  const engagement = createEngagementRuntime({ config })
  return {
    reminderFile,
    reminders,
    timers,
    reminderRuntime,
    rateLimiter: new RateLimiter({ config }),
    duplicateGuard: new DuplicateGuard({ config }),
    personaFileCache,
    personaCorpusRuntime,
    votes: new Map(),
    pendingKicks: new Map(),
    pluginVersion,
    lastNotifyAt: 0,
    quietRanges: parseQuietRanges(config.quietHours),
    lastPokeAt: new Map(),
    genLastAt: new Map(),
    genDaily: new Map(),
    external,
    engagement,
  }
}
