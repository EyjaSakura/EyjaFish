// 运行时快照的纯组装：给控制台进程读的 qq-runtime.json 内容。
/** @param {any} args */
export function collectRuntimeSnapshot({ bridge, featureFlags, replayHints, botAdminTtlMs = 0, countLines = () => 0, now = Date.now(), pid = process.pid, uptimeSeconds = Math.round(process.uptime()) }) {
  const sessions = [...bridge.sessions.values()].map((entry) => ({
    chatKey: entry.key,
    sessionId: entry.sessionId,
    status: String(entry.handle.agent.status ?? 'unknown'),
    lastTraceId: entry.lastTraceId ?? '',
    lastTurnAt: entry.lastTurnAt ?? 0,
  }))
  return {
    now,
    pid,
    version: bridge.pluginVersion,
    uptimeSeconds,
    sessions,
    counts: {
      reminders: bridge.reminders.size,
      votes: bridge.votes.size,
      games: bridge.games.size,
    },
    botOnline: bridge.botOnline,
    botOnlineAt: bridge.botOnlineAt,
    botAdmin: [...bridge.botAdminKnown.entries()].map(([groupId, admin]) => ({
      groupId,
      admin,
      at: Number(bridge.botAdminKnownAt.get(groupId)) || 0,
    })),
    botAdminTtlMs,
    joinsPending: bridge.joinGuard.size,
    features: featureFlags(),
    replay: replayHints(),
    inbox: bridge.inbox.summary(),
    archive: bridge.archive,
    keepDays: bridge.config.historyArchiveKeepDays,
    inject: {
      enabled: bridge.config.injectEnabled === true,
      file: bridge.injectFile,
      dryRun: bridge.config.injectDryRun !== false,
      intervalMs: bridge.injectInterval ?? 0,
      consumed: bridge.injectConsumed ?? 0,
      lastAt: bridge.injectLastAt ?? 0,
      queued: countLines(bridge.injectFile),
    },
    broadcast: bridge.broadcast,
    webhook: bridge.webhook,
    config: bridge.config,
    autoHealAt: bridge.autoHealAt,
    gate: bridge.gate,
    trace: bridge.trace,
  }
}
