// OneBot 消息/通知/请求解析与文件源转换（纯函数）。
import { parseCard, renderCard, decodeCqPayload } from './qq-card.js'

/**
 * 文本 at  匹配（v0.5.9 真机抓到）。
 *
 * 背景：`replyOnlyWhenMentioned` 原本只看 `at` 段。但**有些 QQ 客户端把 at 机器人 发成纯文本**
 * ——正文里就是字面 `at 昵称`，一个 `at` 段都没有（真机实测：同一群里别人发的 at  是真 at 段、
 * 能被识别；用户自己发的那条 `ats=[]`、正文是 `at 机器人昵称 /打卡名册`）。结果就是
 * 用户明明 at  了机器人，桥却当成"没 at "**静默丢掉**，群里一个字都不回。
 *
 * 这里按名字做字面量匹配（不用正则：昵称里可能有 `.` `+` `(` 等元字符）。
 * 命中返回那个名字（便于写进 trace 说清是哪条规则放行的），否则返回空串。
 */
export function mentionsByName(text, names) {
  const value = String(text ?? '')
  if (value === '' || !value.includes('@')) return ''
  for (const raw of names ?? []) {
    const name = String(raw ?? '').trim()
    if (name === '') continue
    if (value.includes(`@${name}`)) return name
  }
  return ''
}

/**
 * 把正文里的 `at 机器人名` 去掉（配套 `mentionsByName` 使用）。
 *
 * 为什么需要：命令是按**行首**锚定匹配的（`^[\/／]命令`）。客户端把 at  发成纯文本时，
 * 正文长这样：`at 机器人昵称 /打卡名册`——光把门禁放行还不够，`/打卡名册` 不在行首，
 * 命令依然认不出来（会当成聊天内容丢给模型）。这里把那个 at 名字 连同后面的空白去掉，
 * 于是 `/打卡名册` 回到行首。名字不匹配时原样返回。
 */
export function stripMentionName(text, name) {
  const value = String(text ?? '')
  const needle = `@${String(name ?? '').trim()}`
  if (value === '' || needle === '@') return value
  const idx = value.indexOf(needle)
  if (idx === -1) return value
  return `${value.slice(0, idx)} ${value.slice(idx + needle.length)}`.replace(/\s+/g, ' ').trim()
}

export function parseMessage(rawMessage, botQq) {
  let text = ''
  const ats = []
  const records = []
  const images = []
  const files = []
  // 合并转发（聊天记录）卡片：本身没有可读内容，只有 id，要靠 get_forward_msg 展开。
  // 以前这里完全没有 forward 分支，于是「只发一张转发卡片」的消息在 #onFrame 就被整条丢掉，
  // 连 trace 都没有——违反「无静默分支必带 reason」。
  const forwards = []
  const cards = [] // [qq-card]
  let reply = null
  if (typeof rawMessage === 'string') {
    const atRe = /\[CQ:at,qq=(\d+)(?:,name=([^\]]*))?\]/g
    let match
    while ((match = atRe.exec(rawMessage)) !== null) ats.push(Number(match[1]))
    const replyMatch = /\[CQ:reply,id=([^,\]]+)(?:,text=([^\]]*))?\]/.exec(rawMessage)
    if (replyMatch) reply = { messageId: replyMatch[1], text: replyMatch[2] ?? '' }
    const recordRe = /\[CQ:record,([^\]]*)\]/g
    while ((match = recordRe.exec(rawMessage)) !== null) {
      const file = /(?:^|,)file=([^,\]]+)/.exec(match[1])
      const url = /(?:^|,)url=([^,\]]+)/.exec(match[1])
      records.push({ file: file ? file[1] : '', url: url ? url[1] : '' })
    }
    const imageRe = /\[CQ:(image|mface),([^\]]*)\]/g
    while ((match = imageRe.exec(rawMessage)) !== null) {
      const url = /(?:^|,)url=([^,\]]+)/.exec(match[2])
      images.push({ kind: match[1], url: url ? url[1] : '', file: '' })
    }
    const fileRe = /\[CQ:file,([^\]]*)\]/g
    while ((match = fileRe.exec(rawMessage)) !== null) {
      const url = /(?:^|,)url=([^,\]]+)/.exec(match[1])
      const name = /(?:^|,)name=([^,\]]+)/.exec(match[1])
      files.push({ name: name ? name[1] : '', url: url ? url[1] : '', file: '' })
    }
    const forwardRe = /\[CQ:forward,([^\]]*)\]/g
    while ((match = forwardRe.exec(rawMessage)) !== null) {
      const id = /(?:^|,)id=([^,\]]+)/.exec(match[1])
      if (id) forwards.push({ id: id[1] })
    }
    // [qq-card] CQ 字符串里的 json / xml 卡片
    const cardRe = /\[CQ:(json|xml),([^\]]*)\]/g
    const cardText = []
    let cardMatch
    while ((cardMatch = cardRe.exec(rawMessage)) !== null) {
      const payload = (/(?:^|,)data=([\s\S]*)$/.exec(cardMatch[2]) || [])[1] || ''
      const card = parseCard(decodeCqPayload(payload), cardMatch[1])
      cards.push(card)
      const line = renderCard(card)
      if (line) cardText.push(line)
    }
    text = stripCq(rawMessage.replace(/\[CQ:at[^\]]*\]/g, ' ').replace(/\[CQ:reply[^\]]*\]/g, ' '))
    if (cardText.length > 0) text = (text ? text + ' ' : '') + cardText.join(' ')
  } else if (Array.isArray(rawMessage)) {
    const parts = []
    for (const segment of rawMessage) {
      if (!segment || typeof segment !== 'object') continue
      if (segment.type === 'text') parts.push((segment.data && segment.data.text) ?? '')
      else if (segment.type === 'at') {
        const atQq = (segment.data && segment.data.qq) ?? ''
        ats.push(Number(atQq) || 0)
        // [补丁] 数组格式下同 CQ 路径一样把 at  渲染进正文，便于 agent 看到被 at  的人
        const atName = (segment.data && (segment.data.name ?? segment.data.nickname ?? segment.data.card)) || ''
        parts.push(atName && atQq ? `@${atName}(${atQq})` : (atName ? `@${atName}` : `@${atQq}`))
      }
      else if (segment.type === 'reply') {
        reply = { messageId: segment.data?.id ?? '', text: segment.data?.text ?? '' }
      } else if (segment.type === 'record') {
        records.push({
          file: segment.data?.file ?? '',
          url: segment.data?.url ?? '',
          path: segment.data?.path ?? '',
        })
      } else if (segment.type === 'image' || segment.type === 'mface') {
        images.push({
          kind: segment.type,
          url: segment.data?.url ?? '',
          file: segment.data?.file ?? '',
          summary: segment.data?.summary ?? '',
        })
      } else if (segment.type === 'file') {
        files.push({
          name: segment.data?.name ?? segment.data?.file_name ?? '',
          url: segment.data?.url ?? '',
          file: segment.data?.file ?? segment.data?.file_id ?? '',
        })
      } else if (segment.type === 'json' || segment.type === 'xml') {
        // [qq-card] 富卡片：data.data 里是原始 json / xml 载荷
        const payload = String(segment.data?.data ?? '')
        const card = parseCard(payload, segment.type)
        cards.push(card)
        const line = renderCard(card)
        if (line) parts.push(line)
      } else if (segment.type === 'forward') {
        const id = segment.data?.id
        if (id !== undefined && id !== null && String(id) !== '') forwards.push({ id: String(id) })
      }
    }
    text = parts.join(' ')
  }
  return { text: text.replace(/\s+/g, ' ').trim(), ats, records, images, files, forwards, cards, reply } // [qq-card]
}

function stripCq(text) {
  // Keep CQ:at with names readable; drop image/face/etc. payload noise.
  return String(text)
    .replace(/\[CQ:at,qq=(\d+)(?:,name=([^\]]*))?\]/g, (_m, qq, name) => name ? `@${name}` : `@${qq}`)
    .replace(/\[CQ:[^\]]+\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Parse a OneBot v11 notice frame into a normalized shape (poke / member in-out / recall / ...). */
export function parseNotice(frame) {
  if (!frame || frame.post_type !== 'notice') return null
  return {
    noticeType: frame.notice_type ?? '',
    subType: frame.sub_type ?? '',
    groupId: frame.group_id !== undefined ? Number(frame.group_id) : undefined,
    userId: frame.user_id !== undefined ? Number(frame.user_id) : undefined,
    targetId: frame.target_id !== undefined ? Number(frame.target_id) : undefined,
    operatorId: frame.operator_id !== undefined ? Number(frame.operator_id) : undefined,
    messageId: frame.message_id !== undefined ? frame.message_id : undefined,
    duration: frame.duration !== undefined ? Number(frame.duration) : undefined,
    selfId: frame.self_id !== undefined ? Number(frame.self_id) : undefined,
    // v0.5.3 互动：真机探针确认过的字段（group_msg_emoji_like / notify.poke / notify.input_status）。
    likes: Array.isArray(frame.likes) ? frame.likes : undefined,
    isAdd: frame.is_add !== undefined ? frame.is_add !== false : undefined,
    messageSeq: frame.message_seq !== undefined ? frame.message_seq : undefined,
    senderId: frame.sender_id !== undefined ? Number(frame.sender_id) : undefined,
    eventType: frame.event_type !== undefined ? Number(frame.event_type) : undefined,
    statusText: frame.status_text !== undefined ? String(frame.status_text) : undefined,
    // v0.5.8 权限自愈：group_admin 的「设/撤」在 **sub_type** 里（'set' / 'unset'），
    // 真机探针确认该事件**没有** set 布尔字段；其它 notice 类型下为 undefined。
    adminSet: frame.notice_type === 'group_admin' ? frame.sub_type !== 'unset' : undefined,
  }
}

/** Parse a OneBot v11 request frame (group join / friend add) into a normalized shape. */
export function parseRequest(frame) {
  if (!frame || frame.post_type !== 'request') return null
  return {
    requestType: frame.request_type === 'friend' ? 'friend' : 'group',
    subType: frame.sub_type ?? 'add',
    userId: frame.user_id !== undefined ? Number(frame.user_id) : 0,
    groupId: frame.group_id !== undefined ? Number(frame.group_id) : 0,
    comment: String(frame.comment ?? ''),
    flag: String(frame.flag ?? ''),
    selfId: frame.self_id !== undefined ? Number(frame.self_id) : undefined,
  }
}


export function toOneBotFileSource(file) {
  const raw = String(file ?? '').trim()
  if (raw === '') return raw
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return raw
  if (raw.startsWith('/')) return `file://${raw}`
  // [win-path 2026-10-31] 以前 Windows 绝对路径原样返回，NapCat 直接报"识别URL失败"。
  // NapCat 跑在 WSL 里，所以盘符路径要转成 /mnt/<盘>/... 再挂 file://。
  return windowsPathToWslUri(raw) || raw
}

/** Windows 绝对路径 → WSL file URI（失败返回空串）。 */
export function windowsPathToWslUri(file) {
  const m = String(file ?? '').match(/^([A-Za-z]):[\\/](.*)$/)
  if (!m) return ''
  return `file:///mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, '/')}`
}

/** Windows 绝对路径 → 原生 file URI（NapCat 在 Windows 上跑时用这个）。 */
export function windowsPathToFileUri(file) {
  const m = String(file ?? '').match(/^([A-Za-z]):[\\/](.*)$/)
  if (!m) return ''
  return `file:///${m[1].toUpperCase()}:/${m[2].replace(/\\/g, '/')}`
}

