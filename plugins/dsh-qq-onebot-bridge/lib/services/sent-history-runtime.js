// Sent-message history used by /撤回 and qq_recall.
export function createSentHistoryRuntime({ sentMessages, config, gate, server, debugLog }) {
  function trackSent(chatKey, data) {
    const id = data?.message_id ?? data?.messageId
    if (id === undefined || id === null || id === '') return
    const list = sentMessages.get(chatKey) ?? []
    list.push({ messageId: id, at: Date.now() })
    if (list.length > 20) list.splice(0, list.length - 20)
    sentMessages.set(chatKey, list)
  }

  async function recallRecent(chatKey, count = 1) {
    const list = sentMessages.get(chatKey) ?? []
    if (list.length === 0) return 0
    const maxAge = Math.max(10, Number(config.recallWindowSeconds) || 110) * 1000
    const now = Date.now()
    const candidates = list.filter((item) => now - item.at <= maxAge).slice(-count).reverse()
    let recalled = 0
    for (const item of candidates) {
      const result = await gate.run('delete_msg', chatKey, String(item.messageId), () => server.deleteMsg(server.currentSocket(), item.messageId))
      if (result.ok) {
        recalled += 1
        const remaining = (sentMessages.get(chatKey) ?? []).filter((x) => x.messageId !== item.messageId)
        sentMessages.set(chatKey, remaining)
      } else {
        debugLog(`recall denied: ${result.reason}`)
      }
    }
    return recalled
  }

  return { trackSent, recallRecent }
}
