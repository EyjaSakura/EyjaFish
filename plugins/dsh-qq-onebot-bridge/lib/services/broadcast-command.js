// /播报：查看定时播报任务、手动触发、入站 webhook 状态。
/** @param {any} args */
export async function handleBroadcastCommand({ message, text, config = {}, canRun, broadcast, webhook, safeReply }) {
  const matched = /^[\/／]播报(?:\s+(.*))?$/.exec(String(text ?? '').trim())
  if (!matched) return false
  if (!(config.adminEnabled && canRun(message, 'cmd.broadcast').allowed)) {
    await safeReply(message, '⚠️ 播报管理仅管理员可用。')
    return true
  }
  const arg = String(matched[1] ?? '').trim()
  const lines = []
  if (broadcast) {
    const jobs = broadcast.list()
    lines.push(`📢 定时播报（${jobs.filter((job) => job.enabled).length}/${jobs.length} 启用）`)
    for (const job of jobs) {
      const next = job.nextAt ? new Date(job.nextAt).toLocaleString('zh-CN', { hour12: false }) : '—'
      lines.push(`· ${job.id}：${job.describe}｜下次 ${next}${job.lastReason ? `｜上次 ${job.lastReason}` : ''}`)
    }
    if (arg !== '') {
      const runId = /^测试\s+(.+)$/.exec(arg)?.[1]?.trim() ?? ''
      if (runId === '') {
        lines.push('用法：/播报 测试 <任务 id>')
      } else {
        const result = await broadcast.runOnce(runId, { manual: true })
        lines.push(result.ok ? `✅ 已触发 ${runId}：${result.reason || '已发送'}` : `⚠️ 触发 ${runId} 失败：${result.reason}`)
      }
    }
  } else {
    lines.push('📢 定时播报未启用（broadcastEnabled=false 或 broadcastJobs 为空）')
  }
  if (webhook) {
    const status = webhook.status()
    lines.push(`🔗 入站 webhook：端口 ${status.port}${status.listening ? '（监听中）' : '（未监听）'}，来源 ${status.sources.length} 个`)
    for (const source of status.sources) lines.push(`· ${source.name}：收到 ${source.received}｜丢弃 ${source.dropped}`)
  } else {
    lines.push('🔗 入站 webhook 未启用（webhookEnabled=false）')
  }
  await safeReply(message, lines.join('\n'))
  return true
}
