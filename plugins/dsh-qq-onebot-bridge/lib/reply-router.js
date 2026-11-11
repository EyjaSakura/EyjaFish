// 自动抽取自 bridge.js #replyTo
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, unlinkSync, statSync } from 'node:fs'
import { join, basename, dirname, extname } from 'node:path'
import { splitSegments } from './shared-helpers.js'
import { MAX_QQ_MESSAGE_CHARS } from './command-constants.js'

// [fixed-format] 固定格式白名单：命中就整条发出，不拆行、不改标点。新格式往这里加，第一条是用量表。
const FIXED_FORMATS = [
  { id: 'usage', prefix: '【模型用量】' },
]


export async function replyTo({ route, text, opts, bridge, defineTool, debugLog }) {
  const { forceForward = false, traceId = '' } = opts || {}
  // [outbound-guard] internal injection echo -> drop whole message
  {
    const __raw = String(text ?? '')
    if (/\u3010\u7cfb\u7edf\u3011|\u53ea\u505a\u8fd9\u4e00\u4ef6\u4e8b|\u4e0d\u8981\u63d0\u8fd9\u6761\u63d0\u793a|id=activity-|\u3010\u6700\u8fd1\u6d88\u606f/.test(__raw)) {
      debugLog('[outbound-guard] dropped injected echo: ' + __raw.slice(0, 80).replace(/\s+/g, ' '))
      return false
    }
  }
  const key = bridge.chatKeyOf(route)
  const __fixed = FIXED_FORMATS.find((f) => String(text ?? '').trim().startsWith(f.prefix))
  if (!__fixed) {
  text = String(text ?? '').replace(/表情[a-z0-9]{3,6}/gi, '那张表情') // [hide-face-id] 不把内部编号发给人看
  // [no-period] 聊天不用句号：句号变停顿（空格），交给拆条逻辑；末尾标点去掉
  text = String(text).replace(/。/g, ' ').replace(/[。．.]+\s*$/g, '').replace(/[ \t]+$/g, '')
  // [no-punct2] 感叹号→口牙（互联网梗），问号去掉（疑问交给"吗/呢"表达）

  // [punct-observe] 只观测：记录被删掉的问号，不改变行为
  {
    const __qm = String(text).match(/[^。！？!?\n]{0,20}[?？]/g)
    if (__qm) debugLog('[punct-observe] 问号被删：' + __qm.map((x) => x.replace(/[?？]/g, '').trim()).join(' | ').slice(0, 120))
  }
  text = String(text).replace(/[!！]+/g, '口牙').replace(/[?？]+/g, '').replace(/\s+$/g, '')
  // [split-semantic] 换行/分号必拆；空格只在“左边收句、右边起句”时拆
  {
    const END = /[了吧呢啊呀嘛哦咯啦哈嗯呗哟喔，,]$/
    const START = /^(我|你|他|她|它|这|那|就|还|但|不|别|好|行|对|是|有|没|要|想|能|会|可|真|太|反正|算了|不过|然后|所以|因为|而且|但是|只是|其实|要是|如果|那就|这不|你看)/
    const __parts = []
    for (const __para of String(text).split(/[\n；;]+/)) {
      const __toks = __para.trim().split(/\s+/).filter(Boolean)
      let __cur = ''
      for (const __t of __toks) {
        if (__cur === '') { __cur = __t; continue }
        const __canSplit = !/^https?:\/\//.test(__cur) && !/^https?:\/\//.test(__t) && __cur.length >= 3 && END.test(__cur) && START.test(__t)
        if (__canSplit) { __parts.push(__cur); __cur = __t } else { __cur += ' ' + __t }
      }
      if (__cur.trim()) __parts.push(__cur.trim())
    }
    const __lines = __parts.map((x) => x.trim()).filter((x) => x.length >= 2)
    if (__lines.length > 1) {
      let __ok = true
      for (const __line of __lines) {
        const __r = await bridge.replyTo(route, __line, { forceForward, traceId })
        if (__r === false) __ok = false
      }
      return __ok
    }
  }

  }

  // [human-delay] 拟人延迟：先"看到/思考"再发送，避免秒回。
  // 1100ms 基础 + 每字 26ms，封顶 6s，再叠加 0~1400ms 随机抖动。
  {
    const __humanLen = String(text ?? '').length
    const __humanThink = Math.min(6000, 1100 + __humanLen * 26) + Math.floor(Math.random() * 1400)
    await new Promise((resolve) => setTimeout(resolve, __humanThink))
  }
  // 回复落地 → 撤销私聊「正在输入」（只有真的发过才撤销，未启用时这行是零成本）。
  if (route?.messageType === 'private' && bridge.typingSent.size > 0) {
    void bridge.typingStopFor(route).catch((error) => debugLog(`typing stop failed: ${error.message}`))
  }
  if (bridge.injectionSuppressed(key)) {
    bridge.markSuppressed(key, '回复', text, traceId)
    return false
  }
  if ((bridge.sessions.get(key)?.currentTurnInjected === true)) { // [inject-queue] 注入回合的文字不外发
    debugLog('[inject-queue] dropped injected-turn text: ' + String(text).slice(0, 40))
    return false
  }
  if (bridge.rateLimited(key)) {
    debugLog(`rate limited, reply dropped (${key})`)
    bridge.enqueueOutbox(key, route, text) // [outbox] 稍后补发
    // [ratelimit-notice] 额度用完后仍继续发消息：告诉对方一声（同一窗口 15 秒内只提示一次）
    bridge.rateNoticeMap ??= new Map()
    if (Date.now() - (bridge.rateNoticeMap.get(key) ?? 0) > 15000) {
      bridge.rateNoticeMap.set(key, Date.now())
      try {
        const noticeSocket = (route?.bot && route.bot.readyState === 1) ? route.bot : bridge.server.currentSocket()
        if (noticeSocket && route?.targetId) {
          const noticeText = '信息有点多，脑子要转不过来了啊喂'
          await bridge.server.action(noticeSocket, route.messageType === 'group' ? 'send_group_msg' : 'send_private_msg', route.messageType === 'group'
            ? { group_id: Number(route.targetId), message: [{ type: 'text', data: { text: noticeText } }] }
            : { user_id: Number(route.targetId), message: [{ type: 'text', data: { text: noticeText } }] })
          debugLog('[ratelimit-notice] sent to ' + key)
        }
      } catch (error) { debugLog('[ratelimit-notice] failed: ' + error.message) }
    }
    if (traceId) {
      bridge.trace.event({
        id: traceId, stage: 'ratelimit', ok: false, chatKey: key, level: 'warn',
        reason: `出站限流：${bridge.config.rateLimitWindowSeconds}s 内已超过 ${bridge.config.rateLimitMaxReplies} 条回复，本条被丢弃`,
      })
    }
    return false
  }
  if (bridge.shouldForward(text, route, forceForward)) {
    try {
      await bridge.sendForwardCard(route, text)
      if (traceId) bridge.trace.event({ id: traceId, stage: 'reply', ok: true, chatKey: key, data: { mode: 'forward-card', chars: String(text).length } })
      return true
    } catch (error) {
      debugLog(`forward card failed, falling back to plain text: ${error.message}`)
      if (traceId) bridge.trace.event({ id: traceId, stage: 'reply', ok: false, chatKey: key, level: 'warn', reason: `合并转发失败，已回退普通文本：${error.message}` })
    }
  }
  const segments = bridge.config.faceEnabled
    ? bridge.faces.expandMarkers(text)
    : [{ type: 'text', data: { text } }]
  const limit = bridge.config.maxMessageLength || MAX_QQ_MESSAGE_CHARS
  const batches = splitSegments(segments, limit)
  const started = Date.now()
  for (let __humanI = 0; __humanI < batches.length; __humanI += 1) {
    if (__humanI > 0) {
      // [human-delay] 分条间隔：偶尔长停顿，模拟"在打下一句"
      const __humanPrev = String(batches[__humanI - 1]?.length ?? '')
      const __humanLong = Math.random() < 0.2
      const __humanGap = __humanLong
        ? 3500 + Math.floor(Math.random() * 4000)
        : 800 + Math.min(2000, Number(__humanPrev) * 12) + Math.floor(Math.random() * 900)
      await new Promise((resolve) => setTimeout(resolve, __humanGap))
    }
    const data = await bridge.server.sendSegments(route.bot, route.messageType, route.targetId, batches[__humanI])
      try {
        const __mid = data?.message_id ?? data?.data?.message_id
        if (__mid) bridge.pushRecentMsg(key, __mid, '大肥鱼', text)
      } catch { /* ignore */ } // [quote-reply]
    bridge.trackSent(key, data)
  }
  if (traceId) {
    bridge.trace.event({
      id: traceId, stage: 'reply', ok: true, chatKey: key, ms: Date.now() - started,
      data: { mode: 'text', batches: batches.length, chars: String(text).length, target: `${route.messageType}:${route.targetId}` },
    })
  }
  return true
}
