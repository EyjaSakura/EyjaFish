// 绑定聊天到会话：工作区绑定优先，否则记聊天会话；并尽力登记工作区成员。
export function bindSession({
  key,
  sessionId,
  source = 'open',
  getBinding,
  setBinding,
  rememberSession,
  ensureMembership,
  backfill,
  isBackfillPending,
  clearBackfillPending,
  trace,
}) {
  const binding = getBinding(key)
  if (binding) {
    binding.sessionId = String(sessionId)
    setBinding(key, binding)
  } else {
    rememberSession(key, String(sessionId))
  }
  if (binding) {
    try {
      void ensureMembership(binding, String(sessionId), key, source).catch(() => {})
    } catch { /* 同步异常也吞掉，绑定优先 */ }
  }
  if (isBackfillPending() === true) {
    clearBackfillPending()
    try {
      void backfill().catch(() => {})
    } catch { /* 同样吞掉 */ }
  }
  trace?.event({
    id: '', stage: 'bind', ok: true, chatKey: key, level: 'info',
    reason: `绑定 ${key} -> ${String(sessionId).slice(0, 12)}（来源 ${source}）`,
    data: { sessionId: String(sessionId), source, scope: binding ? 'workspace' : 'chat' },
  })
}
