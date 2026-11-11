// 私聊“在忙，稍后回你”的限频提示。
/** @param {any} args */
export async function sendBusyNotice({
  message,
  stateFile,
  readFile,
  server,
  state,
  now = Date.now(),
  random = Math.random,
  debugLog = () => {},
}) {
  try {
    if (message.messageType !== 'private') return
    const uid = String(message.userId)
    if (now - (state.at.get(uid) || 0) < 300_000) return
    if (now - state.globalAt < 20_000) return
    let st = {}
    try { st = JSON.parse(readFile(stateFile)) } catch { /* 没状态就按普通忙 */ }
    const fresh = Number(st.updatedAt) && (now - Number(st.updatedAt) < 30 * 60_000)
    const act = (fresh ? String(st.activity || '') : '').slice(0, 24).trim() || '手头这点事'
    const etaMin = Number(st.etaMin)
    const eta = Number.isFinite(etaMin) && etaMin > 0 ? '大概' + etaMin + '分钟' : ['一两分钟', '几分钟', '一会儿', '很快'][Math.floor(random() * 4)]
    const tpl = [
      '在忙' + act + ' ' + eta + '回你',
      '正' + act + '呢 ' + eta + '说',
      '忙着' + act + ' 稍等啊',
      '先忙' + act + ' ' + eta + '找你',
    ]
    const text = tpl[Math.floor(random() * tpl.length)]
    const sock = server.currentSocket()
    if (!sock) return
    await server.sendText(sock, 'private', Number(uid), text)
    state.at.set(uid, now)
    state.globalAt = now
    debugLog('[busy-notice] sent u' + uid + ': ' + text)
  } catch (e) { debugLog('[busy-notice] failed: ' + (e && e.message)) }
}
