// Stage 1.5 LLM extraction seam. It is NOT called by the live adapter yet.
// A host that wants LLM extraction injects callModel(prompt) -> string|object.
import { extractStageOneNodes } from './extract.mjs'

const ALLOWED_TYPES = new Set(['event', 'fact', 'feeling', 'promise', 'narrative'])

/**
 * @param {{ subject?: string, turns?: any[] }} args
 */
export function buildExtractionPrompt({ subject, turns = [] }) {
  const transcript = turns.map((t) => `${t.role ?? '?'}[${t.index ?? '?'}]: ${String(t.text ?? '').slice(0, 800)}`).join('\n')
  return [
    '你是记忆抽取器。只输出 JSON 数组，不要解释。',
    '每个节点字段：type(event|fact|feeling|promise|narrative), description, predicate, object, importance(0..1), arousal(-1..1), valence(-1..1), confidence(0..1), entities(数组), raw_quote。',
    '规则：',
    '- assistant 自己生成的内容不能进入 fact；只能 event/reflection。',
    '- external_web / 网页内容不能进入 fact；source=external_web 只能 event。',
    '- 身份/权限/敏感事实标记 pending，由 owner 确认。',
    '- 没有明确证据不要编造；宁可不抽。',
    `subject=${subject}`,
    '对话：',
    transcript,
  ].join('\n')
}

export function parseExtraction(raw) {
  if (raw && typeof raw === 'object') return raw
  const text = String(raw ?? '').trim()
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  const body = fenced ? fenced[1] : text
  return JSON.parse(body)
}

/**
 * @param {any} input
 * @param {{ subject?: string, windowId?: string, traceId?: string, turns?: any[] }} [options]
 */
export function validateExtraction(input, { subject, windowId, traceId, turns = [] } = {}) {
  const list = Array.isArray(input) ? input : input?.nodes
  if (!Array.isArray(list)) throw new Error('extraction must be an array')
  const rawByIndex = new Map(turns.map((t) => [Number(t.index), String(t.text ?? '')]))
  const nodes = []
  for (const item of list) {
    const type = String(item?.type ?? '')
    if (!ALLOWED_TYPES.has(type)) continue
    const description = String(item?.description ?? '').trim()
    if (description === '') continue
    const source = String(item?.source ?? 'user_message')
    if (type === 'fact' && source === 'external_web') continue
    if (type === 'fact' && source === 'assistant') continue
    const index = Number(item?.turn_index ?? turns[0]?.index ?? 0)
    const raw = String(item?.raw_quote ?? rawByIndex.get(index) ?? '')
    nodes.push({
      id: `llm-${traceId || Date.now()}-${nodes.length}`,
      type,
      subject: String(item?.subject ?? subject ?? 'unknown'),
      predicate: item?.predicate ? String(item.predicate) : null,
      description: description.slice(0, 1000),
      raw_quote: raw.slice(0, 1000),
      entities: Array.isArray(item?.entities) ? item.entities.map(String) : [],
      importance: Math.max(0, Math.min(1, Number(item?.importance ?? 0.5))),
      arousal: Math.max(-1, Math.min(1, Number(item?.arousal ?? 0))),
      valence: Math.max(-1, Math.min(1, Number(item?.valence ?? 0))),
      confidence: Math.max(0, Math.min(1, Number(item?.confidence ?? 0.7))),
      source,
      status: type === 'fact' && /身份|权限|管理员|密码|地址|电话/.test(description) ? 'pending' : 'active',
      dedup_key: `${traceId || 'turn'}:${index}:llm:${nodes.length}`,
      window_id: windowId,
      created_at: Number(item?.created_at) || Date.now(),
      owner_confirmed: type === 'fact' && /身份|权限|管理员|密码|地址|电话/.test(description) ? 0 : 1,
      time_scope: 'permanent',
    })
  }
  return nodes
}

/**
 * @param {{ callModel?: (prompt: string) => any, subject?: string, windowId?: string, traceId?: string, turns?: any[] }} [options]
 */
export async function extractWithLLM({ callModel, subject, windowId, traceId, turns = [] } = {}) {
  if (typeof callModel !== 'function') throw new Error('callModel is required')
  try {
    const prompt = buildExtractionPrompt({ subject, turns })
    const raw = await callModel(prompt)
    const nodes = validateExtraction(parseExtraction(raw), { subject, windowId, traceId, turns })
    if (nodes.length === 0) return { source: 'fallback', nodes: extractStageOneNodes({ subject, windowId, traceId, turns }) }
    return { source: 'llm', nodes }
  } catch {
    return { source: 'fallback', nodes: extractStageOneNodes({ subject, windowId, traceId, turns }) }
  }
}
