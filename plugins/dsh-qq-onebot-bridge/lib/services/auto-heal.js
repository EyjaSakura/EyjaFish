// 掉线自愈：限冷却/每小时上限后拉起 QQ 客户端。
/** @param {any} args */
export function tryAutoHeal({
  config = {},
  trace,
  logger,
  spawn,
  healCommandLabel,
  history = [],
  now = Date.now(),
}) {
  if (config.autoHealEnabled !== true) return history
  const command = String(config.autoHealCommand ?? '').trim()
  if (command === '') {
    trace?.event({ id: '', stage: 'heal', ok: false, level: 'warn', reason: 'autoHealEnabled=true 但没配 autoHealCommand，无法拉起 QQ 客户端' })
    return history
  }
  const cooldown = Math.max(30, Number(config.autoHealCooldownSeconds) || 300) * 1000
  const maxPerHour = Math.max(1, Number(config.autoHealMaxPerHour) || 3)
  const at = history.filter((ts) => now - ts < 3_600_000)
  const last = at[at.length - 1] ?? 0
  if (last > 0 && now - last < cooldown) {
    trace?.event({ id: '', stage: 'heal', ok: false, level: 'info', reason: `自愈冷却中（距上次 ${Math.round((now - last) / 1000)}s，冷却 ${Math.round(cooldown / 1000)}s）` })
    return at
  }
  if (at.length >= maxPerHour) {
    trace?.event({ id: '', stage: 'heal', ok: false, level: 'warn', reason: `自愈已达每小时上限（${maxPerHour} 次），本次不再拉起；请手动检查 NapCat/QQ` })
    return at
  }
  at.push(now)
  try {
    const child = spawn(command, { detached: true, stdio: 'ignore', shell: true, windowsHide: true })
    child.unref()
    trace?.event({
      id: '', stage: 'heal', ok: true,
      reason: `已尝试拉起 QQ 客户端（第 ${at.length}/${maxPerHour} 次/小时）：${healCommandLabel(command)}`,
    })
    logger?.warn(`auto-heal: launched ${command}`)
  } catch (error) {
    trace?.event({ id: '', stage: 'heal', ok: false, level: 'error', reason: `自愈启动失败：${error.message}` })
  }
  return at
}
