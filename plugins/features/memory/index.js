// 记忆工具：memory_search / memory_timeline（只读长期记忆 v2）
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const MEMORY_DIR = 'D:/DSH/qqbot/data/memory'

export function registerMemoryTools({ defineTool, agentCtx, key, debugLog }) {
  const flag = 'D:\\DSH\\qqbot\\data\\memory\\USE_V2'
  if (!existsSync(flag)) return
  const load = () => import(pathToFileURL('D:/DSH/qqbot/data/memory/memory_store.mjs').href)
  try {
    agentCtx.tools.register(defineTool({
      name: 'memory_search',
      description: '在长期记忆里检索事件（不是聊天原文）。用于回答“之前那件事”“上次说的”“我们不是约过吗”。',
      parameters: {
        query: { type: 'string', required: true, description: '关键词，中文即可' },
        project: { type: 'string', description: '限定项目：voice/maa/memory/qzone/pet/misc' },
        days: { type: 'number', description: '只看最近 N 天，省略表示全部' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            hits: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string', required: true },
                  title: { type: 'string' },
                  project: { type: 'string' },
                  at: { type: 'number' },
                  excerpt: { type: 'string' },
                },
              },
            },
          },
        },
        render: (_a, v) => [{
          type: 'text',
          text: v.hits.length
            ? v.hits.map(h => '- ' + h.title + '｜' + (h.project || '') + '｜' + new Date(h.at).toLocaleDateString('zh-CN') + '（' + h.id + '）').join('\n')
            : '没有找到相关记忆',
        }],
      },
      timeoutMs: 15000,
      isConcurrencySafe: () => true,
      async execute(args) {
        const m = await load()
        const days = Number(args?.days) || 0
        const since = days > 0 ? Date.now() - days * 86400000 : undefined
        const hits = m.searchEvents(String(args?.query || ''), { project: args?.project, since })
        return { hits: hits.map(h => ({ id: h.id, title: h.title, project: h.project, at: h.at, excerpt: h.excerpt })) }
      },
    }))
    agentCtx.tools.register(defineTool({
      name: 'memory_timeline',
      description: '按天查看最近发生的事（事件时间轴），用于“这几天都干了什么”。',
      parameters: {
        days: { type: 'number', description: '回看天数，默认 7' },
        project: { type: 'string', description: '限定项目' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            days: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  day: { type: 'string', required: true },
                  titles: { type: 'array', required: true, items: { type: 'string' } },
                },
              },
            },
          },
        },
        render: (_a, v) => [{
          type: 'text',
          text: v.days.length
            ? v.days.map(d => d.day + '：' + d.titles.join('；')).join('\n')
            : '这段时间没有记录',
        }],
      },
      timeoutMs: 15000,
      isConcurrencySafe: () => true,
      async execute(args) {
        const m = await load()
        const days = Number(args?.days) || 7
        const since = Date.now() - days * 86400000
        const evs = m.readEvents(0, { project: args?.project }).filter(e => e.at >= since)
        const byDay = {}
        for (const e of evs) {
          const day = new Date(e.at).toISOString().slice(0, 10)
          ;(byDay[day] ||= []).push(e.title)
        }
        return { days: Object.keys(byDay).sort().map(day => ({ day, titles: byDay[day] })) }
      },
    }))
    debugLog(`tool surface ${key}: memory_search/memory_timeline registered`)
  } catch (e) {
    debugLog(`tool surface ${key}: memory tools failed ${e?.message ?? e}`)
  }
}

export const hooks = { registerMemoryTools }
