// /ws 工作区切换：列表、关闭绑定、按名字/序号切换。
export async function handleWorkspaceCommand({
  message,
  text,
  routeKey,
  canSwitch,
  readRegistry,
  formatList,
  getBinding,
  clearBinding,
  disposeSession,
  matchWorkspace,
  workspaceSessions,
  workspaceSessionBusy,
  setBinding,
  safeReply,
}) {
  const match = /^[\/／](ws|workspace|工作区)(?:\s+([\s\S]*))?$/.exec(String(text ?? '').trim())
  if (!match) return false
  const key = routeKey
  if (!canSwitch(message)) {
    await safeReply(message, '⚠️ 工作区切换只对管理员开放。')
    return true
  }
  const arg = (match[2] ?? '').trim()
  const list = readRegistry()
  if (list.length === 0) {
    await safeReply(message, '⚠️ 没读到工作区登记表。先用客户端打开一次工作区，再试 /ws。')
    return true
  }
  if (arg === '' || arg === 'list' || arg === '列表') {
    await safeReply(message, formatList(key, list))
    return true
  }
  if (arg === 'off' || arg === '关闭' || arg === '默认' || arg === 'default') {
    const binding = getBinding(key)
    if (binding === null) {
      await safeReply(message, '当前没有绑定工作区。')
      return true
    }
    clearBinding(key)
    await disposeSession(key)
    await safeReply(message, `已退出工作区 ${binding.title}。下一条消息回到本聊天原来的会话。`)
    return true
  }
  const target = matchWorkspace(arg, list)
  if (target === null) {
    await safeReply(message, `没找到工作区「${arg}」（或用序号指定）。发 /ws 看列表。`)
    return true
  }
  const sessions = workspaceSessions(target)
  const latest = sessions[0] ?? null
  const busy = latest ? await workspaceSessionBusy(latest.id) : false
  const binding = { title: target.title, path: target.path, sessionId: busy ? '' : (latest?.id ?? '') }
  setBinding(key, binding)
  await disposeSession(key)
  const lines = [`已切到工作区：${target.title}`, `路径：${target.path}`]
  if (busy) {
    lines.push(`最新会话 ${latest.id.slice(0, 8)} 正被其他窗口占用，下一条消息会在该工作区新建一条。`)
  } else if (latest) {
    lines.push(`下一条消息继续最新会话 ${latest.id.slice(0, 8)}（本工作区共 ${sessions.length} 条）。`)
  } else {
    lines.push('该工作区还没有会话，下一条消息会在其中新建一条。')
  }
  lines.push('我的回复仍然发到这里。用 /ws off 退出。')
  await safeReply(message, lines.join('\n'))
  return true
}
