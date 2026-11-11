// 最近工作摘要工具：让她在上下文预算内读完最近的自检记，而不是整份 read
import { readFileSync } from 'node:fs'

const DIARY = 'D:\\DSH\\qqbot\\小鲸鱼自检记.txt'

function parseEntries(raw) {
  const entries = []
  let cur = null
  for (const line of raw.split(/\r?\n/)) {
    if (/^\[?\d{4}-\d{2}-\d{2}/.test(line)) {
      if (cur) entries.push(cur)
      cur = [line]
    } else if (cur) cur.push(line)
  }
  if (cur) entries.push(cur)
  return entries
}

export function registerWorklogTools({ defineTool, agentCtx }) {
  agentCtx.tools.register(defineTool({
    name: 'qq_worklog',
    description: '读取最近的自检记条目（默认 12 条，最多 40 条），每条截断到 500 字。用于了解近期改了什么，避免整份读入超长文件。',
    parameters: {
      limit: { type: 'number', description: '取最近多少条，默认 12，最多 40' },
      grep: { type: 'string', description: '可选：只取正文包含该关键词的条目' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { detail: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: value.detail }],
    },
    async execute(args) {
      let raw = ''
      try { raw = readFileSync(DIARY, 'utf8') } catch (e) { return { detail: '自检记读取失败：' + e.message } }
      const all = parseEntries(raw)
      const kw = String(args.grep || '').trim()
      const filtered = kw ? all.filter((b) => b.join('\n').includes(kw)) : all
      if (filtered.length === 0) return { detail: kw ? '没有包含「' + kw + '」的条目' : '自检记里还没有条目' }
      const limit = Math.max(1, Math.min(40, Number(args.limit) || 12))
      const picked = filtered.slice(-limit).reverse()
      const fmt = (b) => {
        const text = b.join(' ').replace(/\s+/g, ' ').trim()
        return '· ' + (text.length > 500 ? text.slice(0, 500) + '…' : text)
      }
      return {
        detail: '最近 ' + picked.length + ' 条自检记' + (kw ? '（含「' + kw + '」）' : '') + '：\n' + picked.map(fmt).join('\n'),
      }
    },
  }))
}