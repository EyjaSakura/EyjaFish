// /remind add bridge adapter.
import { addReminder as addReminderService } from './reminder-command.js'
import { debugLog } from '../core/debug-log.js'

export function addReminderForBridge({ bridge, message, parsed }) {
  return addReminderService({
    message,
    parsed,
    config: bridge.config,
    routeKey: bridge.routeKey(message),
    reminders: bridge.reminders,
    saveReminders: () => bridge.saveReminders(),
    scheduleReminder: (rem) => bridge.scheduleReminder(rem),
    safeReply: (m, t) => bridge.safeReply(m, t),
    debugLog,
  })
}
