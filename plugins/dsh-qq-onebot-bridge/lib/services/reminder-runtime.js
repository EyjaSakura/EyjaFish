// Reminder runtime: persistence, timers, recurring reschedule, delivery.
// Extracted from bridge.js so the bridge only wires dependencies.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { nextRecurrenceAt } from '../reminders.js'

/**
 * @param {{
 *   file: string,
 *   reminders: Map<string, any>,
 *   timers: Set<any>,
 *   server: any,
 *   logger: any,
 *   debugLog: (msg: string) => void,
 *   injectedBlocked: (rem: any, label: string) => boolean,
 * }} deps
 */
export function createReminderRuntime({ file, reminders, timers, server, logger, debugLog, injectedBlocked }) {
  function save() {
    try {
      const list = [...reminders.values()].map(({ id, key, route, dueAt, content, rule }) => ({
        id, key, route, dueAt, content, ...(rule ? { rule } : {}),
      }))
      writeFileSync(file, JSON.stringify(list, null, 2), 'utf8')
    } catch (error) {
      debugLog(`reminders save failed: ${error.message}`)
    }
  }

  async function deliver(rem) {
    if (injectedBlocked(rem, '提醒')) return
    const socket = server.currentSocket() ?? rem.route.bot
    if (!socket) {
      debugLog(`reminder ${rem.id} has no bot socket (dropped)`)
      return
    }
    try {
      await server.sendSegments(socket, rem.route.messageType, rem.route.targetId, [
        { type: 'text', data: { text: `⏰ 提醒：${rem.content}` } },
      ])
      debugLog(`reminder delivered ${rem.id}`)
    } catch (error) {
      debugLog(`reminder deliver failed: ${error.message}`)
      logger.error(`QQ reminder deliver failed: ${error.message}`)
    }
  }

  function reschedule(rem) {
    const nextAt = nextRecurrenceAt(rem.rule)
    if (nextAt === null) {
      debugLog(`recurring reminder ${rem.id} has no next occurrence (dropped)`)
      return
    }
    const next = { ...rem, dueAt: nextAt, timer: null }
    reminders.set(next.id, next)
    save()
    schedule(next)
    debugLog(`recurring reminder ${rem.id} rescheduled for ${new Date(nextAt).toISOString()}`)
  }

  function schedule(rem) {
    const fire = () => {
      reminders.delete(rem.id)
      save()
      void deliver(rem)
      if (rem.rule) reschedule(rem)
    }
    const arm = () => {
      const delay = rem.dueAt - Date.now()
      if (delay <= 0) { fire(); return }
      const timer = setTimeout(() => {
        timers.delete(timer)
        arm()
      }, Math.min(delay, 0x7fffffff))
      timers.add(timer)
      rem.timer = timer
    }
    arm()
  }

  function load() {
    try {
      if (!existsSync(file)) return
      const list = JSON.parse(readFileSync(file, 'utf8'))
      if (!Array.isArray(list)) return
      const now = Date.now()
      for (const item of list) {
        if (!item?.id || !item?.route || typeof item?.dueAt !== 'number' || typeof item?.content !== 'string') continue
        if (item.dueAt < now - 5 * 60_000) {
          debugLog(`reminder dropped (overdue >5min) ${item.id}`)
          continue
        }
        const rem = { ...item, dueAt: Math.max(item.dueAt, now + 1_000), timer: null }
        reminders.set(rem.id, rem)
        schedule(rem)
        debugLog(`reminder restored ${rem.id} due ${new Date(rem.dueAt).toISOString()}`)
      }
      save()
    } catch (error) {
      debugLog(`reminders load failed: ${error.message}`)
    }
  }

  return { load, save, schedule, reschedule, deliver }
}
