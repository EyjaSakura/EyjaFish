// watchdog 事故补报：解析 incident jsonl、按水位线过滤、生成播报文本。

export function summarizeWatchdogIncidents(raw, notifiedAt = 0) {
  const fresh = []
  for (const line of String(raw ?? '').split('\n').slice(-300)) {
    if (line.trim() === '') continue
    try {
      const entry = JSON.parse(line)
      if (Number(entry?.at) > Number(notifiedAt)) fresh.push(entry)
    } catch { /* 跳过坏行 */ }
  }

  const lastAt = fresh.length > 0 ? Math.max(...fresh.map((entry) => Number(entry?.at) || 0)) : 0
  const downs = fresh.filter((entry) => entry.kind === 'down').length
  const restarts = fresh.filter((entry) => entry.kind === 'restart').length
  const recovered = fresh.filter((entry) => entry.kind === 'recovered')
  const limited = fresh.filter((entry) => entry.kind === 'rate-limited').length

  const lines = ['🐕 宿主掉线告警（watchdog 记录，已自动处理）']
  if (downs > 0) lines.push(`· 掉线 ${downs} 次`)
  if (restarts > 0) lines.push(`· 自动重启 ${restarts} 次`)
  if (recovered.length > 0) {
    const downtime = recovered[recovered.length - 1]?.downtimeSeconds
    lines.push(`· 最近一次停机 ${downtime ?? '?'} 秒后恢复`)
  }
  if (limited > 0) lines.push(`· ⚠️ 触发限流 ${limited} 次（watchdog 已停止自动重启，需要人工介入）`)

  return {
    fresh,
    lastAt,
    downs,
    restarts,
    recovered,
    limited,
    lines,
    alertable: downs + restarts + limited > 0,
  }
}
