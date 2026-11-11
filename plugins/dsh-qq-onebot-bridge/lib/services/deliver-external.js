// 把外部文本（播报 / webhook）交给 replyTo，并写 trace。
export async function deliverExternal({
  chatKey,
  text,
  stage,
  routeFromChatKey,
  server,
  replyTo,
  trace,
}) {
  const route = routeFromChatKey(chatKey)
  if (!route) {
    trace?.event({ id: '', stage, ok: false, level: 'warn', reason: `${stage}的会话键无效：${String(chatKey ?? '')}（应为 g:群号 或 u:QQ号）` })
    return false
  }
  const body = String(text ?? '').trim()
  if (body === '') {
    trace?.event({ id: '', stage, ok: false, level: 'warn', chatKey, reason: `${stage}内容为空，未发送` })
    return false
  }
  const socket = server.currentSocket()
  if (!socket) {
    trace?.event({ id: '', stage, ok: false, level: 'warn', chatKey, reason: `机器人当前不在线，${stage}未发送` })
    return false
  }
  try {
    const sent = await replyTo({ bot: socket, ...route }, body, {})
    trace?.event({
      id: '', stage, ok: sent !== false, level: sent === false ? 'warn' : 'info', chatKey,
      reason: sent === false ? `${stage}出站被拦下（限流或注入回合）` : `${stage}已发送（${body.length} 字）`,
    })
    return sent !== false
  } catch (error) {
    trace?.event({ id: '', stage, ok: false, level: 'error', chatKey, reason: `${stage}发送失败：${error.message}` })
    return false
  }
}
