// Stage 1.5 deterministic extractor. It does not call an LLM yet; it produces
// one event per substantive user turn plus a few explicit, rule-safe facts.
// The LLM extractor will replace/augment this behind the same output shape.
const SUBSTANTIVE = /(记住|记一下|别忘了|约定|答应|喜欢|讨厌|想要|准备|正在|最近|今天|明天|昨天|端口|路径|文件|项目|工作|学习|考试|生日|名字|住在|养了|买了|去了|做了|开始|结束|完成)/
const GREETING = /^(你好|在吗|嗨|hi|hello|早|晚安|早安|午安|哈哈|嗯|哦|好的|ok|行|可以)[。！!？?~～\s]*$/i
const IDENTITY = /^(记住|记一下)[：:，,\s]*(.*(?:管理员|主人|权限|身份|密码|地址|电话).*)$/

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
  for (const match of value.matchAll(/(?:port|端口)\s*[：:]?\s*(\d{2,5})/gi)) entities.add(`port:${match[1]}`)
  for (const match of value.matchAll(/\b(D:\\[^\s，。；;]+)/g)) entities.add(`path:${match[1]}`)
  for (const match of value.matchAll(/([\u4e00-\u9fff]{1,4}(?:姐|哥|叔|姨|老师|同学|总))/g)) entities.add(`person:${match[1]}`)
  return [...entities]
}

function pushFact(nodes, turn, subject, predicate, value, { pending = false, importance = 0.65 } = {}) {
  const text = String(turn.text).slice(0, 1000)
  nodes.push({
    id: `fact-${turn.__traceId || Date.now()}-${turn.index ?? 0}-${nodes.length}`,
    type: 'fact',
    subject,
    predicate,
    description: String(value).slice(0, 1000),
    raw_quote: text,
    entities: extractEntities(text),
    importance,
    arousal: 0.1,
    valence: 0,
    confidence: pending ? 0.4 : 0.75,
    source: 'user_message',
    status: pending ? 'pending' : 'active',
    dedup_key: `${turn.__traceId || 'turn'}:${turn.index ?? 0}:fact:${nodes.length}`,
    window_id: turn.__windowId || '',
    created_at: turn.ts || Date.now(),
    owner_confirmed: pending ? 0 : 1,
    time_scope: 'permanent',
  })
}

export function extractStageOneNodes({ subject, windowId, traceId, turns = [] }) {
  const nodes = []
  for (const turn of turns) {
    if (turn.role !== 'user') continue
    const text = String(turn.text ?? '').trim()
    if (!isSubstantive(text)) continue
    const local = { ...turn, __traceId: traceId, __windowId: windowId }
    nodes.push({
      id: `ev-${traceId || Date.now()}-${turn.index ?? 0}`,
      type: 'event',
      subject,
      description: text.slice(0, 1000),
      raw_quote: text.slice(0, 1000),
      entities: extractEntities(text),
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
    const identity = IDENTITY.exec(text)
    if (identity) pushFact(nodes, local, `${subject}.identity`, 'identity.claim', identity[2], { pending: true, importance: 0.8 })
    const port = /(?:端口|port)\s*[：:]?\s*(\d{2,5})/i.exec(text)
    if (port) pushFact(nodes, local, 'system.port', 'port', port[1])
    const prefer = /我(?:很)?(?:喜欢|爱)\s*([^。！!？?\n]{1,40})/.exec(text)
    if (prefer) pushFact(nodes, local, `${subject}.preferences`, 'prefers', prefer[1])
    const dislike = /我(?:很)?(?:讨厌|不喜欢)\s*([^。！!？?\n]{1,40})/.exec(text)
    if (dislike) pushFact(nodes, local, `${subject}.preferences`, 'dislikes', dislike[1])
    const promise = /(?:答应|约定|说好)\s*([^。！!？?\n]{1,80})/.exec(text)
    if (promise) pushFact(nodes, local, `${subject}.promises`, 'promise', promise[1], { importance: 0.75 })
  }
  return nodes
}
