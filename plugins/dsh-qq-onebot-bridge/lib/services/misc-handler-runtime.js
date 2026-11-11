// Image generation, typing indicator, and verification sweeper.
import { handleImageGen as handleImageGenService } from './image-gen.js'
import { generateImage } from '../imagegen.js'
import { planInputStatus, describeInputStatus } from '../engage.js'
import { debugLog } from '../core/debug-log.js'

export async function handleImageGen({ bridge, message, prompt }) {
  return handleImageGenService({
    message,
    prompt,
    config: bridge.config,
    chatLimits: (m, keys) => bridge.chatLimits(m, keys),
    genLastAt: bridge.genLastAt,
    genDaily: bridge.genDaily,
    generateImage,
    imageDir: bridge.imageDir,
    sendImageBuffer: (route, buffer) => bridge.sendImageBuffer(route, buffer),
    safeReply: (m, t) => bridge.safeReply(m, t),
    debugLog,
  })
}

export async function sendTyping({ bridge, message, eventType }) {
  if (!bridge.engageOn('typingEnabled')) return { ok: false, reason: `正在输入未启用：engageEnabled=${bridge.config.engageEnabled === true}，typingEnabled=${bridge.config.typingEnabled === true}` }
  const plan = planInputStatus({
    userId: message.messageType === 'group' ? undefined : message.userId,
    eventType,
    isGroup: message.messageType === 'group',
  })
  if (!plan.ok) return { ok: false, reason: plan.reason }
  if (bridge.engageWriteBlocked(message)) return { ok: false, reason: bridge.engageBlockedReason('输入状态') }
  try {
    const gated = await bridge.gate.run('set_input_status', `u:${message.userId}`, describeInputStatus(eventType), () => bridge.server.setInputStatus(message.bot, plan.params.user_id, plan.params.event_type))
    return gated.ok === true ? { ok: true, reason: '' } : { ok: false, reason: gated.reason }
  } catch (error) {
    return { ok: false, reason: error.message }
  }
}

export function startVerifySweeper({ bridge }) {
  if (!bridge.config.verifyEnabled) return
  const timer = setInterval(() => {
    if (bridge.stopped) return
    const expired = bridge.joinGuard.expire()
    if (expired.length > 0) {
      debugLog(`join requests expired: ${expired.map((entry) => `#${entry.id}`).join(',')}`)
      void bridge.notifyAdmin(`⏰ 有 ${expired.length} 条入群/加好友请求已超时未处理：${expired.map((entry) => `#${entry.id}(${entry.userId})`).join('、')}`)
    }
  }, 60_000)
  if (typeof timer.unref === 'function') timer.unref()
  bridge.timers.add(timer)
}
