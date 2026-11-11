// 运行时快照构建：把 bridge 的实时状态格式化成 qq-runtime.json 的内容。
// 纯函数（只读传入对象），方便单测。

export function buildRuntimeSnapshot(state) {
  const {
    now,
    pid,
    version,
    uptimeSeconds,
    sessions = [],
    counts = {},
    botOnline = null,
    botOnlineAt = 0,
    botAdmin = [],
    botAdminTtlMs = 0,
    joinsPending = 0,
    features = {},
    replay = {},
    inbox = {},
    archive = null,
    keepDays = 90,
    inject = {},
    broadcast = null,
    webhook = null,
    config = {},
    autoHealAt = [],
    gate = { snapshot: () => ({}) },
    trace = { summary: () => ({}), listTraces: () => [] },
  } = state

  return {
    updatedAt: now,
    pid,
    version,
    uptimeSeconds,
    sessions,
    sessionCount: sessions.length,
    reminders: counts.reminders ?? 0,
    votes: counts.votes ?? 0,
    games: counts.games ?? 0,
    botOnline,
    botOnlineAt,
    botAdmin: botAdmin.map((entry) => {
      const at = Number(entry?.at) || 0
      return {
        groupId: String(entry?.groupId ?? ''),
        admin: entry?.admin === true,
        at,
        stale: at === 0 || now - at > botAdminTtlMs,
      }
    }),
    joinsPending,
    features,
    replay,
    inbox,
    archive: {
      enabled: archive !== null,
      dir: archive ? archive.dir : '',
      keepDays: Math.max(1, Number(keepDays) || 90),
    },
    injection: {
      enabled: inject.enabled === true,
      file: inject.file,
      dryRun: inject.dryRun !== false,
      intervalMs: inject.intervalMs ?? 0,
      consumed: inject.consumed ?? 0,
      lastAt: inject.lastAt ?? 0,
      queued: inject.queued ?? 0,
    },
    jobs: {
      broadcast: broadcast
        ? broadcast.list().map((job) => ({
            id: job.id,
            kind: job.kind,
            chat: job.chat ?? '',
            enabled: job.enabled === true,
            describe: job.describe ?? '',
            nextAt: job.nextAt ?? 0,
            lastAt: job.lastAt ?? 0,
            lastReason: job.lastReason ?? '',
            runs: job.runs ?? 0,
            failures: job.failures ?? 0,
          }))
        : [],
      webhook: webhook
        ? {
            enabled: true,
            port: config.webhookPort,
            sources: webhook.status().sources.map((source) => ({
              name: source.name,
              received: source.received,
              dropped: source.dropped,
              lastAt: source.lastAt,
            })),
          }
        : { enabled: false, port: config.webhookPort, sources: [] },
      autoHeal: {
        enabled: config.autoHealEnabled === true,
        commandConfigured: Boolean(String(config.autoHealCommand ?? '').trim()),
        cooldownSeconds: Math.max(30, Number(config.autoHealCooldownSeconds) || 300),
        maxPerHour: Math.max(1, Number(config.autoHealMaxPerHour) || 3),
        attemptsLastHour: autoHealAt.filter((at) => now - at < 3_600_000).length,
      },
    },
    gate: gate.snapshot(),
    trace: trace.summary(),
    recentTraces: trace.listTraces({ limit: 10 }),
  }
}
