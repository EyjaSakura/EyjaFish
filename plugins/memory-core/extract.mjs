// Stage 1 deterministic extractor. The LLM extraction pass is intentionally
// deferred to stage 1.5; this produces one event per substantive user turn so
// storage, idempotency and recall can be tested end-to-end without a model.
const SUBSTANTIVE = /(记住|记一下|别忘了|约定|答应|喜欢|讨厌|想要|准备|正在|最近|今天|明天|昨天|端口|路径|文件|项目|工作|学习|考试|生日|名字|住在|养了|买了|去了|做了|开始|结束|完成)/
const GREETING = /^(你好|在吗|嗨|hi|hello|早|晚安|早安|午安|哈哈|嗯|哦|好的|ok|行|可以)[。！!？?~～\s]*$/i

export function isSubstantive(text) {
  const value = String(text ?? '').trim()
  if (value.length < 6) return false
  if (GREETING.test(value)) return false
  return SUBSTANTIVE.test(value) || value.length >= 20
}

export function extractEntities(text) {
  const value = String(text ?? '')
  const entities = new Set()
  for (const match of value.matchAll(/\b\d{5,11}\b/g)) entities.add(`qq:${match[0]}`)
  for (const match of value.matchAll(/\b(?:port|端口)\s*[：:]?\s*(\d{2,5})\b/gi)) entities.add(`port:${match[1]}`)
  for (const match of value.matchAll(/\b(D:\\[^\s，。；;]+)/g)) entities.add(`path:${match[1]}`)
  return [...entities]
}

export function extractStageOneNodes({ subject, windowId, traceId, turns = [] }) {
  const nodes = []
  for (const turn of turns) {
    if (turn.role !== 'user') continue
    if (!isSubstantive(turn.text)) continue
    nodes.push({
      id: `ev-${traceId || Date.now()}-${turn.index ?? 0}`,
      type: 'event',
      subject,
      description: String(turn.text).slice(0, 1000),
      raw_quote: String(turn.text).slice(0, 1000),
      entities: extractEntities(turn.text),
      importance: 0.5,
      arousal: 0,
      valence: 0,
      confidence: 0.7,
      source: 'user_message',
      status: 'active',
      dedup_key: `${traceId || 'turn'}:${turn.index ?? 0}`,
      window_id: windowId,
      created_at: turn.ts || Date.now(),
      owner_confirmed: 1,
      time_scope: 'permanent',
    })
  }
  return nodes
}
