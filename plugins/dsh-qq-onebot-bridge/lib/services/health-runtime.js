// /health report text.
export async function sendHealthReport({ bridge, message }) {
  const key = bridge.routeKey(message)
  const entry = bridge.sessions.get(key)
  const lines = [
    `插件版本：${bridge.pluginVersion}`,
    `机器人 QQ：${bridge.config.botQq || '未配置'}`,
    `宿主运行：${Math.round(process.uptime() / 60)} 分钟`,
    `当前会话：${entry ? entry.sessionId.slice(0, 8) : '无'}`,
    `全部会话数：${bridge.sessions.size}`,
    `待执行提醒：${bridge.reminders.size} 个`,
    `进行中投票：${bridge.votes.size} 个`,
    `本会话记忆条数：${bridge.loadMemoryLines(key).length}`,
    `识图：${bridge.config.visionMode}（${bridge.config.visionToolName}）`,
    `语音转文字：${bridge.config.sttEnabled ? '开' : '关'}｜语音回复：${bridge.config.ttsEnabled ? '开' : '关'}`,
    `会话续接：${bridge.config.sessionResumeEnabled === false ? '关' : `开（已记录 ${Object.keys(bridge.sessionStore.read() ?? {}).length} 个会话）`}`,
    `写操作闸门：${bridge.gate.denied} 次被拒｜${bridge.config.actionAuditEnabled === false ? '审计关' : '审计开'}`,
    `避开高峰期：${bridge.config.quietHoursEnabled ? `开（${(bridge.config.quietHours ?? []).join(' / ')}，${bridge.config.quietWeekendExempt ? '周末豁免' : '含周末'}）` : '关'}`,
  ]
  await bridge.safeReply(message, `📊 小鲸鱼状态\n${lines.join('\n')}`)
}
