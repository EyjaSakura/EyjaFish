// 机器人自我 @ 的识别与清理（只动自己的 @，别人的保留）。

export function isSelfMentionTag(tag, botQq = '', botNames = []) {
  const raw = String(tag ?? '').trim()
  if (raw === '') return false
  const bot = String(botQq ?? '').trim()
  if (bot !== '' && (raw === bot || raw.endsWith(`(${bot})`))) return true
  for (const item of (Array.isArray(botNames) ? botNames : [])) {
    const name = String(item ?? '').trim()
    if (name !== '' && (raw === name || raw.startsWith(`${name}(`))) return true
  }
  return false
}

export function stripSelfMentionAnywhere(text, botQq = '', botNames = []) {
  const bot = String(botQq ?? '').trim()
  const names = (Array.isArray(botNames) ? botNames : [])
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
  let out = String(text ?? '')
  if (bot !== '') {
    out = out.replaceAll(new RegExp(`[@＠][^\\s@＠]{0,64}?\\(\\s*${bot}\\s*\\)`, 'g'), ' ')
    out = out.replaceAll(new RegExp(`[@＠]${bot}(?![0-9])`, 'g'), ' ')
  }
  for (const name of names) out = out.replaceAll(`@${name}`, ' ')
  return out.replace(/[ \t]{2,}/g, ' ').trim()
}

export function stripSelfMention({ message, text, botQq = '', botNames = [] }) {
  if (message.messageType !== 'group' || message.atMe !== true) return String(text ?? '')
  let out = String(text ?? '')
  for (let i = 0; i < 2; i++) {
    const match = /^[@＠]([^\s@＠]{1,64})\s+([\s\S]*)$/.exec(out)
    if (match === null) break
    const [, tag, rest] = match
    if (isSelfMentionTag(tag, botQq, botNames) || /^[\/／]/.test(rest)) out = rest
    else break
  }
  return stripSelfMentionAnywhere(out, botQq, botNames)
}
