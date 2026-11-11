// 自动抽取自 bridge.js #registerOwnerTools
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, unlinkSync, statSync } from 'node:fs'
import { join, basename, dirname, extname } from 'node:path'

export function registerOwnerTools({ agentCtx, route, key, role, bridge, defineTool, debugLog }) {
  const out = {
    schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true }, detail: { type: 'string', required: true } } },
    render: (_a, v) => [{ type: 'text', text: v.detail }],
  }
  agentCtx.tools.register(defineTool({
    name: 'qq_chat_digest',
    description: '主人专属：取出她和某个（或所有）聊天窗口最近几条对话的素材，用来"大概说说聊了什么"。只给主人用；不要逐字转述，也不要透露隐私细节。',
    parameters: {
      chat: { type: 'string', description: '可选：对方 QQ 号或群号；不填则取除当前窗口外最近的几个' },
      limit: { type: 'number', description: '可选：每个窗口取几条，默认 4，最多 8' },
    },
    output: out,
    async execute(args) {
      const uid = String(route?.targetId ?? '')
      const owner = bridge.ownerQQ()
      if (!owner || uid !== owner) return { ok: false, detail: '这个只跟主人说' }
      const contacts = bridge.contacts()
      const dir = bridge.memoryDir
      let files = []
      try { files = readdirSync(dir).filter((f) => f.endsWith('.json')) } catch { files = [] }
      const want = String(args.chat ?? '').replace(/\D/g, '')
      if (want) files = files.filter((f) => f.includes(want))
      const limit = Math.max(1, Math.min(8, Number(args.limit) || 4))
      const blocks = []
      for (const f of files) {
        try {
          const data = JSON.parse(readFileSync(join(dir, f), 'utf8').replace(/^\uFEFF/, ''))
          const history = Array.isArray(data.history) ? data.history : []
          if (history.length === 0) continue
          const id = f.replace(/^u_|^g_|\.json$/g, '')
          if (id === uid) continue
          const kind = f.startsWith('g_') ? '群 ' : ''
          const note = (contacts[id] && contacts[id].note) || ''
          const tail = history.slice(-limit).map((h) => {
            const who = h.role === 'assistant' ? '她' : '对方'
            const text = String(h.text ?? '').replace(/\s+/g, ' ').slice(0, 60)
            return who + '：' + text
          })
          blocks.push('【' + kind + (note ? note + ' ' : '') + id + '】\n' + tail.join('\n'))
        } catch { /* skip */ }
      }
      if (blocks.length === 0) return { ok: true, detail: '没有找到其它窗口的对话记录' }
      return { ok: true, detail: '以下是素材（请用你自己的话概括，不要逐字复述）：\n\n' + blocks.join('\n\n') }
    },
  }))

  agentCtx.tools.register(defineTool({
    name: 'qq_list_chats',
    description: '列出她所有聊天窗口的最近活跃时间与消息条数（仅主人可问）。只返回号码/备注/时间/条数，不返回聊天内容。',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true }, detail: { type: 'string', required: true } } },
      render: (_a, v) => [{ type: 'text', text: v.detail }],
    },
    async execute() {
      const uid = String(route?.targetId ?? '')
      const owner = bridge.ownerQQ()
      if (!owner || uid !== owner) return { ok: false, detail: '这个只跟主人说' }
      const contacts = bridge.contacts()
      const dir = bridge.memoryDir
      let files = []
      try { files = readdirSync(dir).filter((f) => f.endsWith('.json')) } catch { files = [] }
      if (files.length === 0) return { ok: true, detail: '现在还没有任何聊天记录' }
      const rows = []
      for (const f of files) {
        try {
          const data = JSON.parse(readFileSync(join(dir, f), 'utf8').replace(/^\uFEFF/, ''))
          const history = Array.isArray(data.history) ? data.history : []
          const last = history.length ? history[history.length - 1].ts : 0
          const id = f.replace(/^u_|^g_|\.json$/g, '')
          const kind = f.startsWith('g_') ? '群 ' : ''
          const note = (contacts[id] && contacts[id].note) || ''
          rows.push({
            line: '- ' + kind + (note ? note + ' ' : '') + id + '：最近 ' + (last ? new Date(last).toLocaleString() : '无记录') + '，记录 ' + history.length + ' 条',
            last,
          })
        } catch { /* skip */ }
      }
      rows.sort((a, b) => b.last - a.last)
      return { ok: true, detail: '她的聊天窗口：\n' + rows.map((r) => r.line).join('\n') }
    },
  }))
}
