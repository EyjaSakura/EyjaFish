// Outbound text messaging: notifier, reply, forward card, forwarding policy.
import { replyTo as replyToService } from '../reply-router.js'
import { createNotifier } from './notify.js'
import { shouldForwardText } from '../send.js'
import { debugLog } from '../core/debug-log.js'
import { sendBusyNotice as sendBusyNoticeService } from './busy-notice.js'
import { readFileSync } from 'node:fs'

export function createMessagingRuntime({ bridge, config, trace, gate, server, chatKeyOf, routeOf, getInjectWindows, trackSent, defineTool }) {
  let notifier = null

  function notify(text) {
    notifier ??= createNotifier({ config, trace, debugLog })
    void notifier.send(text)
  }

  async function reply(message, text) {
    await replyTo({
      bot: message.bot,
      messageType: message.messageType,
      targetId: message.messageType === 'group' ? message.groupId : message.userId,
    }, text, { traceId: message.__trace?.id ?? '' })
  }

  async function replyTo(route, text, opts) {
    return replyToService({ route, text, opts, defineTool, debugLog, bridge })
  }

  function shouldForward(text, route, forceForward) {
    return shouldForwardText(text, {
      enabled: config.forwardLongReplies === true,
      force: forceForward,
      threshold: config.forwardThresholdChars,
      messageType: route.messageType,
    })
  }

  async function sendForwardCard(route, text) {
    const key = chatKeyOf(route)
    const node = {
      type: 'node',
      data: {
        name: String(config.botName || '小鲸鱼'),
        uin: String(config.botQq || ''),
        content: [{ type: 'text', data: { text: String(text) } }],
      },
    }
    const result = await gate.run('send_group_forward_msg', key, `len=${String(text).length}`, () => server.sendForwardMsg(route.bot, route.messageType, route.targetId, [node]))
    if (!result.ok) throw new Error(result.reason)
    trackSent(key, result.value)
    debugLog(`forward card sent (${String(text).length} chars)`)
  }

  function offlineMarked(message, text) {
    if (typeof text !== 'string' || text === '') return text
    if (config.injectDryRun === false) return text
    if (text.startsWith('（回放/注入')) return text
    let offline = message?.__injected === true || message?.__replayed === true
    if (!offline && message) {
      try {
        offline = getInjectWindows().active(chatKeyOf(routeOf(message)))
      } catch { /* shape mismatch */ }
    }
    return offline ? `（回放/注入：未真正发到 QQ）${text}` : text
  }

  async function safeReply(message, text) {
    try {
      await reply(message, offlineMarked(message, text))
    } catch (error) {
      debugLog(`reply failed: ${error.message}`)
    }
  }

  let busyAt = null
  let busyGlobalAt = 0
  async function sendBusyNotice(message) {
    busyAt ??= new Map()
    const state = { at: busyAt, globalAt: busyGlobalAt }
    await sendBusyNoticeService({
      message,
      stateFile: 'D:\\DSH\\qqbot\\data\\self-state.json',
      readFile: (file) => readFileSync(file, 'utf8'),
      server,
      state,
      now: Date.now(),
      debugLog,
    })
    busyGlobalAt = state.globalAt
  }

  return { notify, reply, replyTo, shouldForward, sendForwardCard, safeReply, offlineMarked, sendBusyNotice }
}
