// 自动抽取自 bridge.js #registerQueryTools
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, unlinkSync, statSync } from 'node:fs'
import { join, basename, dirname, extname } from 'node:path'
import { formatHistoryLines, normalizeHistoryMessages } from '@zfqxuz/dsh-qq-onebot-bridge/lib/sdk/index.js'

export function registerQueryTools({ agentCtx, route, key, role, bridge, defineTool, debugLog }) {
  if (bridge.config.memberQueryEnabled !== false && route.messageType === 'group') {
    agentCtx.tools.register(defineTool({
      name: 'qq_member_info',
      description: 'Look up members of the current QQ group. Leave query empty to list the roster; pass a nickname, group card or QQ id to inspect one member (role, level, title, join date, mute state).',
      parameters: {
        query: { type: 'string', description: 'Nickname / group card / QQ id of the member, or empty to list the roster.' },
      },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { found: { type: 'boolean', required: true }, detail: { type: 'string', required: true } } },
        render: (_args, value) => [{ type: 'text', text: value.detail }],
      },
      async execute(args) {
        const raw = String(args.query ?? '').trim()
        const query = raw === ''
          ? { kind: 'list' }
          : (/^\d{4,12}$/.test(raw) ? { kind: 'info', userId: Number(raw) } : { kind: 'info', name: raw })
        const result = await bridge.queryGroupMembers(route.targetId, query)
        return { found: result.ok === true, detail: result.ok ? result.text : `没有查到：${result.reason}` }
      },
    }))
  }
  if (bridge.config.historyQueryEnabled !== false) {
    const cap = Math.max(1, Number(bridge.config.historyQueryLimit) || 20)
    agentCtx.tools.register(defineTool({
      name: 'qq_recent_history',
      description: `Fetch the most recent messages of the current QQ chat as a timestamped transcript (up to ${cap}), so you can answer questions about what was said before. Read-only.`,
      parameters: {
        count: { type: 'number', description: `How many messages to fetch (default and max ${cap}).` },
      },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { count: { type: 'number', required: true }, detail: { type: 'string', required: true } } },
        render: (_args, value) => [{ type: 'text', text: value.detail }],
      },
      async execute(args) {
        const asked = Number(args.count)
        const limit = Math.min(cap, Number.isFinite(asked) && asked >= 1 ? Math.floor(asked) : cap)
        const socket = bridge.server.currentSocket()
        if (!socket) throw new Error('当前无可用 OneBot 连接')
        const raw = route.messageType === 'group'
          ? await bridge.server.getGroupMsgHistory(socket, route.targetId, 0, limit)
          : await bridge.server.getFriendMsgHistory(socket, route.targetId, 0, limit)
        const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.messages) ? raw.messages : [])
        const normalized = normalizeHistoryMessages(list, { botQq: Number(bridge.config.botQq) || 0, limit, maxChars: 2000 })
        if (normalized.messages.length === 0) {
          const why = raw && raw.dryRun === true
            ? '回放/注入模式（dry-run）不访问 QQ，取不到历史消息。'
            : (normalized.reason || '没有取到历史消息。')
          return { count: 0, detail: why }
        }
        const formatted = formatHistoryLines(normalized.messages, { limit, selfId: Number(bridge.config.botQq) || 0 })
        return { count: formatted.used, detail: formatted.text }
      },
    }))
  }
  if (bridge.config.historySearchEnabled !== false && bridge.archive) {
    const searchCap = Math.max(1, Number(bridge.config.historySearchLimit) || 20)
    agentCtx.tools.register(defineTool({
      name: 'qq_search_history',
      description: `Search this chat's locally archived messages for keywords (all keywords must match, case-insensitive), newest first. Use it for questions like "who posted that link". Read-only; up to ${searchCap} hits.`,
      parameters: {
        keywords: { type: 'string', description: 'One or more keywords separated by spaces (all must appear in the message).' },
        days: { type: 'number', description: `How many recent days to scan (default ${Math.max(1, Number(bridge.config.historySearchDays) || 7)}).` },
      },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { count: { type: 'number', required: true }, detail: { type: 'string', required: true } } },
        render: (_args, value) => [{ type: 'text', text: value.detail }],
      },
      async execute(args) {
        const keywords = String(args.keywords ?? '').trim()
        if (keywords === '') return { count: 0, detail: '请给出要搜索的关键词。' }
        if (bridge.injectionSuppressed(key)) return { count: 0, detail: '注入回合：历史检索已跳过（避免把注入内容当历史）' }
        const asked = Number(args.days)
        const days = Math.min(
          Math.max(1, Number(bridge.config.historyArchiveKeepDays) || 90),
          Number.isFinite(asked) && asked >= 1 ? Math.floor(asked) : Math.max(1, Number(bridge.config.historySearchDays) || 7),
        )
        const chatKey = bridge.chatKeyOf(route)
        const result = bridge.archive.search(keywords, { days, limit: searchCap, chatKey })
        if (!result.hits || result.hits.length === 0) {
          return { count: 0, detail: `最近 ${days} 天没有找到「${keywords}」（已扫 ${result.scanned ?? 0} 条）。` }
        }
        const mapped = result.hits.map((hit) => ({
          id: '', userId: hit.userId, name: hit.name,
          time: Math.floor((Number(hit.ts) || 0) / 1000),
          text: hit.text,
        }))
        const formatted = formatHistoryLines(mapped, { limit: searchCap, selfId: Number(bridge.config.botQq) || 0, title: `搜索「${keywords}」` })
        return { count: formatted.used, detail: formatted.text }
      },
    }))
  }
  if (bridge.config.reactToolEnabled !== false) {
    agentCtx.tools.register(defineTool({
      name: 'qq_react',
      description: 'Attach an emoji reaction to a QQ message — a lightweight acknowledgement that does not send a chat message. Uses the message id (defaults to the latest message in this chat) and a QQ emoji id (default 128077 = 👍; e.g. 128516 = 😄, 128064 = 👀).',
      parameters: {
        message_id: { type: 'string', description: 'Target message id; empty = the most recent inbound message of this chat.' },
        emoji_id: { type: 'number', description: 'QQ emoji id for the reaction (default 128077 = 👍).' },
      },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true }, detail: { type: 'string', required: true } } },
        render: (_args, value) => [{ type: 'text', text: value.detail }],
      },
      async execute(args) {
        if (bridge.injectionSuppressed(key)) { bridge.markSuppressed(key, '表情回应'); return { ok: false, detail: '注入回合：表情回应已被 dry-run 拦下（未执行）' } }
        const entry = bridge.sessions.get(key)
        const messageId = String(args.message_id ?? '').trim() || String(entry?.lastInboundMessageId ?? '')
        if (!messageId) throw new Error('没有可回应的消息：请传 message_id，或等对方先发一条消息')
        const emojiId = Math.max(1, Number(args.emoji_id) || 128077)
        const socket = bridge.server.currentSocket()
        if (!socket) throw new Error('当前无可用 OneBot 连接')
        const result = await bridge.gate.run('set_msg_emoji_like', key, `msg=${messageId}`, () => bridge.server.setMsgEmojiLike(socket, messageId, emojiId))
        return { ok: result.ok === true, detail: result.ok ? `已给消息 ${messageId} 贴上表情 ${emojiId}` : `贴表情被拦下：${result.reason}` }
      },
    }))
  }
}
