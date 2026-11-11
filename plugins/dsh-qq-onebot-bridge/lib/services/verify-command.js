// 管理员审批命令：/待审、/同意 N、/拒绝 N、/同意 all。
export async function handleVerifyCommand({
  message,
  cmd,
  joinGuard,
  resolveJoin,
  safeReply,
  trace,
  approvalOffline,
  formatPendingList,
}) {
  if (cmd.action === 'list') {
    await safeReply(message, formatPendingList(joinGuard.list()))
    return
  }
  if (approvalOffline(message)) {
    await safeReply(message, '🧪 注入/回放回合不真的审批，不会向 QQ 发出任何请求。')
    trace?.event({ id: '', stage: 'verify', ok: false, reason: '注入/回放回合不真的审批' })
    return
  }
  if (!cmd.target) {
    await safeReply(message, '用法：/同意 序号、/拒绝 序号、/同意 all、/待审')
    return
  }
  if (cmd.target === 'all') {
    const entries = joinGuard.list()
    if (entries.length === 0) {
      await safeReply(message, '📭 暂无待处理请求。')
      return
    }
    let done = 0
    const failures = []
    for (const entry of entries) {
      const ok = await resolveJoin(entry, cmd.action === 'approve', { offline: approvalOffline(message) })
      if (ok) done += 1
      else failures.push(entry.approveOnly === true && cmd.action !== 'approve'
        ? `#${entry.id} 只能同意（可疑好友申请在 NapCat 侧忽略 approve）`
        : `#${entry.id} 处理失败（详见宿主日志）`)
    }
    await safeReply(message, `✅ 已处理 ${done}/${entries.length} 条请求。${failures.length === 0 ? '' : `\n⚠️ ${failures.length} 条未处理：${failures.slice(0, 5).join('；')}${failures.length > 5 ? ' …' : ''}`}`)
    return
  }
  const entry = joinGuard.find(cmd.target)
  if (!entry) {
    await safeReply(message, `⚠️ 没有 #${cmd.target} 这条待处理请求（用 /待审 查看）。`)
    return
  }
  const ok = await resolveJoin(entry, cmd.action === 'approve', { offline: approvalOffline(message) })
  await safeReply(message, ok
    ? `${cmd.action === 'approve' ? '✅ 已批准' : '⛔ 已拒绝'} #${entry.id}（${entry.userId}）`
    : `⚠️ 处理 #${entry.id} 失败：${entry.approveOnly === true && cmd.action !== 'approve' ? '这类申请（可疑好友）在 NapCat 侧只能同意，approve 参数会被忽略' : '请查看宿主日志'}。`)
}
