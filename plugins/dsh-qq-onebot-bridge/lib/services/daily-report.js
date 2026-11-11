// 每日群日报：给每个目标群构造 prompt，交给 agent 回合。
/** @param {any} args */
export async function runDailyReport({
  stopped,
  server,
  targets,
  config = {},
  trace,
  ensureSession,
  statsStore,
  loadMemoryLines,
  handoff,
  debugLog = () => {},
  now = () => Date.now(),
}) {
  if (stopped) return
  const socket = server.currentSocket()
  if (!socket) {
    debugLog('daily report skipped: no bot connection')
    trace?.event({ id: '', stage: 'report', ok: false, reason: '每日日报未发送：当前没有可用的 OneBot 连接（QQ 掉线）' })
    return
  }
  for (const chatKey of targets()) {
    try {
      const groupId = Number(String(chatKey).replace(/^g:/, ''))
      if (!Number.isFinite(groupId) || groupId === 0) continue
      const message = {
        bot: socket,
        userId: config.botQq || 0,
        messageType: 'group',
        groupId,
        text: '',
        atMe: true,
        ats: [],
        reply: null,
        records: [],
        images: [],
        files: [],
        messageId: `report-${now().toString(36)}`,
        senderName: 'system',
        raw: { message: [] },
      }
      const entry = await ensureSession(message)
      const stats = config.statsEnabled
        ? statsStore.top(chatKey, { days: 1, limit: 5 }).map((row) => `${row.name} ${row.count} 条`).join('、')
        : ''
      const memory = loadMemoryLines(chatKey).slice(-12).join('\n')
      const prompt = '[系统定时任务] 现在是每日群日报时间。请用 3-6 句口语化的话总结今天这个群里聊了些什么（可以点出好玩的事），最后用一行给出今日活跃榜。直接输出日报内容，不要 @ 任何人，也不要复述这条指令。'
        + (stats ? `\n\n今日发言统计：${stats}` : '')
        + (memory ? `\n\n今天的部分聊天记录（最早在前）：\n${memory}` : '')
      handoff(entry, null, {
        content: [{ type: 'text', text: prompt }],
        source: { kind: 'user' },
      })
      debugLog(`daily report queued for ${chatKey}`)
    } catch (error) {
      debugLog(`daily report failed for ${chatKey}: ${error.message}`)
    }
  }
}
