// 入站 webhook：渲染 → 可选 chat 覆盖 → 投递。
/** @param {any} args */
export async function onWebhookEvent({
  source,
  payload,
  config = {},
  renderWebhook,
  deliverExternal,
  trace,
}) {
  const rendered = renderWebhook(source, payload, { maxChars: source?.maxChars })
  if (!rendered.ok) {
    trace?.event({ id: '', stage: 'webhook', ok: false, level: 'warn', reason: `webhook「${source?.name ?? '?'}」渲染失败：${rendered.reason}` })
    return
  }
  trace?.event({ id: '', stage: 'webhook', ok: true, reason: `收到 webhook「${source?.name ?? '?'}」并渲染成 ${rendered.text.length} 字` })
  // [webhook-chat] 允许 payload.chat 指定窗口（仅限白名单私聊）
  let chat = source?.chat
  const want = String(payload?.chat ?? '').trim()
  if (/^u:\d+$/.test(want)) {
    const uid = want.slice(2)
    const allow = [...(config.allowUsers ?? []), ...(config.adminUsers ?? [])].map(String)
    if (allow.includes(uid)) chat = want
  }
  await deliverExternal(chat, rendered.text, 'webhook')
}
