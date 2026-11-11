// 交接状态文本：绑定、live agent、开关、最近生命周期事件。
/** @param {any} args */
export function formatHandoffStatus({ key, binding, entry, stored, config = {}, trace }) {
  const lines = [`交接状态 · ${key}`]
  if (binding) {
    lines.push(`工作区：${binding.title}（${binding.path}）`)
    lines.push(`绑定会话：${binding.sessionId ? binding.sessionId.slice(0, 12) : '（空，下一条在该工作区新建）'}`)
  } else {
    lines.push('工作区：未绑定（走本聊天默认会话）')
    lines.push(`绑定会话：${stored ? stored.slice(0, 12) : '（无）'}`)
  }
  lines.push(entry
    ? `live agent：${entry.sessionId.slice(0, 12)}（${String(entry.handle.agent.status)}）`
    : 'live agent：无（下一条消息按绑定续接，续不上则新建）')
  lines.push('开关：'
    + `认领迁移=${config.claimSessionTransfer !== false ? 'on' : 'off'}`
    + ` · 启动占位=${config.preclaimSessions !== false ? 'on' : 'off'}`
    + ` · 启动对账=${config.reconcileSessions !== false ? 'on' : 'off'}`)
  const events = []
  for (const stage of ['transfer', 'conflict', 'preclaim', 'reconcile', 'bind', 'workspace']) {
    for (const event of trace?.recent({ limit: 50, stage, chatKey: key }) ?? []) events.push(event)
  }
  events.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0))
  const tail = events.slice(-6)
  if (tail.length === 0) {
    lines.push('最近交接事件：无')
  } else {
    lines.push('最近交接事件：')
    for (const event of tail) {
      const at = event.ts ? new Date(event.ts).toLocaleTimeString('zh-CN', { hour12: false }) : ''
      lines.push(`· ${at} [${event.stage}] ${event.ok === false ? '✗' : '✓'} ${String(event.reason ?? '').slice(0, 96)}`)
    }
  }
  return lines.join('\n')
}
