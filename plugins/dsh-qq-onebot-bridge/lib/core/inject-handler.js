// 注入处理器：把一条系统注入派发成消息/通知/请求，处理 dry-run 与忙时排队。
// 依赖通过 host 注入，方便单测。

export async function handleInjection({ kind, frame, host }) {
  const socket = host.server.currentSocket()
  const dryRun = host.config.injectDryRun !== false
  const chatKey = frame.groupId ? `g:${frame.groupId}` : `u:${frame.userId}`

  if (kind === 'message') {
    const entry = host.sessions.get(host.routeKey({ ...frame, bot: socket }))
    if (entry?.turnActive === true) {
      if (!host.deferredQueue.push({ kind, frame, at: Date.now(), chatKey })) {
        host.trace?.event({
          id: '', level: 'warn', module: 'bridge', stage: 'inject', ok: false, chatKey,
          reason: `注入推迟队列已满（${host.deferredQueue.max} 条），本条丢弃；注入只在会话空闲时投递`,
        })
        return
      }
      host.trace?.event({
        id: '', level: 'info', module: 'bridge', stage: 'inject', ok: true, chatKey,
        reason: `注入推迟：该会话正在处理回合，等空闲后再投递（队列 ${host.deferredQueue.size} 条）`,
      })
      return
    }
  }

  if (kind === 'message') {
    const blocked = host.guard(kind, frame)
    if (blocked !== '') {
      host.trace?.event({
        id: '', level: 'warn', module: 'bridge', stage: 'inject', ok: false, chatKey,
        reason: `注入被${blocked === 'duplicate' ? '去重' : '限流'}丢弃（同一内容 10 分钟内只投一次，每分钟最多 3 条）`,
      })
      return
    }
  }

  host.setInjecting(true)
  let previous = null
  try {
    if (dryRun) {
      previous = host.server.setDryRun(true, { groupId: frame.groupId ?? 0, userId: frame.userId ?? 0 })
      host.gate.dryRun = true
      host.beginWindow(chatKey)
    }
    host.trace?.event({
      id: '', level: 'info', module: 'bridge', stage: 'inject', ok: true, chatKey,
      reason: `注入 ${kind}${dryRun ? '（dry-run：不会真发）' : '（真实发送！）'}`, data: { kind, dryRun },
    })
    if (kind === 'notice') await host.onNotice({ ...frame, bot: socket, __injected: true })
    else if (kind === 'request') await host.onRequest({ ...frame, bot: socket, __injected: true })
    else {
      await host.onQqMessage({
        ...frame,
        bot: socket,
        __injected: true,
        ats: frame.ats ?? [],
        reply: frame.reply ?? null,
        records: frame.records ?? [],
        images: frame.images ?? [],
        files: frame.files ?? [],
        forwards: frame.forwards ?? [],
        forwardText: frame.forwardText ?? '',
        raw: { message: [] },
      })
    }
    if (dryRun) {
      const calls = host.server.takeDryRunCalls()
      host.trace?.event({
        id: '', level: 'info', module: 'bridge', stage: 'inject', ok: true, chatKey,
        reason: `注入完成：同步阶段 ${calls.length} 次出站被拦；本会话的 agent 回合（含每一步回复与工具调用）同样会被拦下`,
        data: { wouldSend: calls.map((call) => ({ action: call.action, text: host.summarizeSegments(call.params?.message) })) },
      })
    }
  } finally {
    if (dryRun) host.server.setDryRun(previous?.enabled === true, previous?.scope ?? null)
    if (dryRun) host.gate.dryRun = false
    if (dryRun) host.endWindow(chatKey)
    host.setInjecting(false)
    host.writeSnapshot(true)
  }
}
