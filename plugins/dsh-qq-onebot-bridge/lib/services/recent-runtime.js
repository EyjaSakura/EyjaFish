// Recent-message cache and outbound-message -> sticker name map.
export function createRecentRuntime({ sentMessages }) {
  const stickerMsgMap = new Map()
  const recentMsgs = new Map()
  const recentTexts = new Map()

  function stickerMsgLink(messageId, name) {
    if (!messageId || !name) return
    stickerMsgMap.set(String(messageId), String(name))
    if (stickerMsgMap.size > 500) {
      const first = stickerMsgMap.keys().next().value
      stickerMsgMap.delete(first)
    }
  }

  function linkLastSticker(chatKey, name) {
    try {
      const list = sentMessages.get(chatKey) ?? []
      const last = list[list.length - 1]
      if (last && last.messageId && name) stickerMsgLink(last.messageId, name)
    } catch { /* ignore */ }
  }

  function pushRecentMsg(key, id, role, text) {
    if (!key || !id) return
    const arr = recentMsgs.get(key) ?? []
    arr.push({ id: String(id), role, text: String(text ?? '').replace(/\s+/g, ' ').slice(0, 40), at: Date.now() })
    while (arr.length > 8) arr.shift()
    recentMsgs.set(key, arr)
  }

  function rememberText(messageId, text) {
    const id = String(messageId ?? '').trim()
    const body = String(text ?? '').trim()
    if (id === '' || body === '') return
    recentTexts.set(id, body.slice(0, 120))
    if (recentTexts.size > 300) {
      const oldest = recentTexts.keys().next().value
      if (oldest !== undefined) recentTexts.delete(oldest)
    }
  }

  function recentBlock(key) {
    const arr = recentMsgs.get(key) ?? []
    if (arr.length === 0) return ''
    const lines = arr.slice(-6).map((m) => '- id=' + m.id + ' ' + m.role + '：' + m.text)
    return '【最近消息（需要引用更早的话题时，用 qq_quote_reply 带上对应 id；回复最新一条不用引用）】\n' + lines.join('\n')
  }

  return { stickerMsgLink, linkLastSticker, pushRecentMsg, rememberText, recentBlock }
}
