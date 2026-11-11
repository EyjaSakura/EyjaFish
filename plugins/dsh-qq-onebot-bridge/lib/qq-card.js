/**
 * QQ 富卡片（json / xml 消息段）解析。
 *
 * 背景：OneBot 实现把「分享说说 / 小程序 / 链接 / 音乐」这类消息发成 `{ type: 'json' }`
 * 或 `{ type: 'xml' }` 段，正文在 `data.data` 里。桥原来完全没有这两个分支，于是这类消息
 * 解析出来 text 为空，整条被丢掉——模型既看不到卡片，也拿不到链接。
 *
 * 这里只做「尽量把标题、摘要、链接抠出来」这件事，宁可少抓也不要抛错：
 * QQ 的卡片字段各版本不一样，抓不到就返回空字段，由调用方决定怎么退化。
 *
 * 纯函数，不做 IO。
 */

/** 语义等价的链接字段，按优先级取第一个非空。 */
const URL_KEYS = ['jumpUrl', 'qqdocurl', 'jump_url', 'url', 'shareUrl', 'share_url', 'contentUrl']
const TITLE_KEYS = ['title', 'name', 'titleText']
const DESC_KEYS = ['desc', 'summary', 'description', 'abstract', 'brief', 'content']
const TAG_KEYS = ['tag', 'tagName', 'source']

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ' }

function decodeEntities(value) {
  return String(value ?? '').replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z#0-9]+);/g, (m, name) => {
    const key = String(name).toLowerCase()
    if (XML_ENTITIES[key]) return XML_ENTITIES[key]
    if (key.startsWith('#x')) {
      const code = Number.parseInt(key.slice(2), 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : m
    }
    if (key.startsWith('#')) {
      const code = Number.parseInt(key.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : m
    }
    return m
  })
}

function str(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function firstOf(obj, keys) {
  if (!obj || typeof obj !== 'object') return ''
  for (const key of keys) {
    const v = str(obj[key])
    if (v) return v
  }
  return ''
}

/** 深度遍历，按优先级收集字段（QQ 卡片的层级各版本不一致）。 */
function deepCollect(obj, depth = 0, acc = { title: '', desc: '', url: '', tag: '' }) {
  if (!obj || typeof obj !== 'object' || depth > 6) return acc
  if (Array.isArray(obj)) {
    for (const item of obj) deepCollect(item, depth + 1, acc)
    return acc
  }
  if (!acc.title) acc.title = firstOf(obj, TITLE_KEYS)
  if (!acc.desc) acc.desc = firstOf(obj, DESC_KEYS)
  if (!acc.url) acc.url = firstOf(obj, URL_KEYS)
  if (!acc.tag) acc.tag = firstOf(obj, TAG_KEYS)
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') deepCollect(value, depth + 1, acc)
  }
  return acc
}

/** meta 下常见的几种载荷：news / music / detail_1 / ark 等，先按这些取。 */
function fromMeta(meta) {
  const acc = { title: '', desc: '', url: '', tag: '', preview: '' }
  if (!meta || typeof meta !== 'object') return acc
  for (const value of Object.values(meta)) {
    if (!value || typeof value !== 'object') continue
    if (!acc.title) acc.title = firstOf(value, TITLE_KEYS)
    if (!acc.desc) acc.desc = firstOf(value, DESC_KEYS)
    if (!acc.url) acc.url = firstOf(value, URL_KEYS)
    if (!acc.tag) acc.tag = firstOf(value, TAG_KEYS)
    if (!acc.preview) acc.preview = str(value.preview) || str(value.icon)
  }
  return acc
}

export function parseJsonCard(text) {
  const raw = String(text ?? '')
  const card = { kind: 'json', parsed: false, app: '', view: '', title: '', desc: '', url: '', tag: '', preview: '', prompt: '', raw }
  let obj
  try {
    obj = JSON.parse(raw)
  } catch {
    // 少数实现会把 json 再包一层转义，尝试一次 unescape
    try {
      obj = JSON.parse(raw.replace(/\\"/g, '"').replace(/\\\\/g, '\\'))
    } catch {
      return card
    }
  }
  if (!obj || typeof obj !== 'object') return card
  card.parsed = true
  card.app = str(obj.app)
  card.view = str(obj.view)
  card.prompt = str(obj.prompt)
  const metaHit = fromMeta(obj.meta)
  Object.assign(card, {
    title: metaHit.title,
    desc: metaHit.desc,
    url: metaHit.url,
    tag: metaHit.tag,
    preview: metaHit.preview,
  })
  if (!card.title || !card.url) {
    const deep = deepCollect(obj)
    if (!card.title) card.title = deep.title
    if (!card.desc) card.desc = deep.desc
    if (!card.url) card.url = deep.url
    if (!card.tag) card.tag = deep.tag
  }
  if (!card.title) card.title = card.prompt
  card.url = normalizeLink(card.url)
  return card
}

/** XML 卡片：<msg ...><item ...><title>..</title><summary>..</summary><url>..</url></item></msg> */
export function parseXmlCard(text) {
  const raw = String(text ?? '')
  const clean = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_m, inner) => String(inner))
  const pick = (name) => {
    const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(clean)
    return m ? decodeEntities(m[1]).trim() : ''
  }
  const card = {
    kind: 'xml',
    parsed: true,
    app: pick('app') || '',
    view: '',
    title: pick('title'),
    desc: pick('summary') || pick('brief') || pick('content'),
    url: '',
    tag: pick('source') || pick('name') || '',
    preview: '',
    prompt: pick('prompt'),
    raw,
  }
  const urlRe = /https?:\/\/[^\s"'<>\\]+/g
  for (const key of ['url', 'jumpurl', 'qqdocurl', 'contenturl', 'brief']) {
    const v = pick(key)
    if (v && /^https?:\/\//i.test(v)) {
      card.url = decodeEntities(v).replace(/\\\//g, '/')
      break
    }
  }
  if (!card.url) {
    const hit = clean.match(/https?:\/\/[^\s"'<>\\]+/)
    if (hit) card.url = decodeEntities(hit[0]).replace(/\\\//g, '/')
  }
  if (!card.url) {
    const any = urlRe.exec(decodeEntities(clean))
    if (any) card.url = any[0]
  }
  if (!card.title) card.title = card.prompt || card.desc
  card.url = normalizeLink(card.url)
  return card
}

export function parseCard(text, kind = 'json') {
  return kind === 'xml' ? parseXmlCard(text) : parseJsonCard(text)
}

/** CQ 码字符串里的 data= 会做转义（&#44; 逗号、&#91; 方括号、&amp;），这里还原。 */
export function decodeCqPayload(value) {
  return String(value ?? '')
    .replace(/&#44;/g, ',')
    .replace(/&#91;/g, '[')
    .replace(/&#93;/g, ']')
    .replace(/&#40;/g, '(')
    .replace(/&#41;/g, ')')
    .replace(/&amp;/g, '&')
}

/** base64 / base64url 解码（QQ 的 schema 参数常省略 padding）。 */
function b64Decode(value) {
  try {
    let s = String(value ?? '').replace(/-/g, '+').replace(/_/g, '/')
    const pad = s.length % 4
    if (pad !== 0) s += '='.repeat(4 - pad)
    return Buffer.from(s, 'base64').toString('utf8')
  } catch {
    return ''
  }
}

/**
 * 把 QQ 的内部跳转链接还原成真正能打开的 http 链接。
 *
 * 说说卡片常见形态：url = mqqapi://qzoneschema/?schema=<base64>，解开后是
 * mqzone://arouse/detail?...&oldlink=<urlencode 过的 https 地址>。模型拿到 mqqapi 没有任何用，
 * 所以这里优先吐 oldlink，其次吐 schema 里第一个 http 链接；解不出来就原样返回。
 */
export function normalizeLink(url) {
  const raw = String(url ?? '').trim()
  if (!raw) return ''
  if (!/^(mqqapi:\/\/|mqzone:\/\/|qzone:\/\/|qqzone:\/\/)/i.test(raw)) return decodeEntities(raw)
  const m = /[?&]schema=([^&]+)/i.exec(raw)
  if (!m) return raw
  const decoded = b64Decode(decodeURIComponent(m[1]))
  if (!decoded) return raw
  const old = /[?&]oldlink=([^&]+)/i.exec(decoded)
  if (old) {
    try {
      const target = decodeURIComponent(old[1])
      if (/^https?:\/\//i.test(target)) return target
    } catch {
      // oldlink 被截断过，解不开就继续往下找
    }
  }
  const any = /https?:\/\/[^\s"'<>&\\]+/i.exec(decoded)
  if (any) return decodeEntities(any[0]).replace(/\\\//g, '/')
  return raw
}

/** 渲染成一行给模型看的文本；什么都没抓到时返回空串（由调用方决定要不要留占位）。 */
export function renderCard(card) {
  if (!card || !card.parsed) return ''
  const label = card.tag || card.app || ''
  const head = label ? `[卡片 ${label}]` : '[卡片]'
  const title = (card.title || '').slice(0, 120)
  const desc = card.desc && card.desc !== card.title ? card.desc.slice(0, 120) : ''
  const url = card.url || ''
  // 链接不能截断：截了就点不开，宁可标题和摘要少给几个字
  if (!title && !desc && !url) return ''
  const parts = [title, desc].filter(Boolean).join(' | ')
  const body = parts ? `${parts} | ${url}` : url
  const out = `${head} ${body}`.replace(/[ \t]+/g, ' ').trim()
  return out.length > 600 ? out.slice(0, 600) : out
}

/** 便于日志/工具用的精简结构。 */
export function cardDigest(card, max = 500) {
  if (!card) return ''
  return JSON.stringify({
    kind: card.kind,
    app: card.app,
    title: card.title,
    desc: card.desc,
    url: card.url,
    tag: card.tag,
  }).slice(0, max)
}
