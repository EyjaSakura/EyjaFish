// 会话条目的标准形状：注册表/agent 映射都从这里建，避免字段漂移。
export function createSessionEntry({ key, route, handle, resumed = false }) {
  return {
    key,
    route,
    handle,
    agent: handle.agent,
    sessionId: String(handle.agent.id),
    resumed,
    lastTraceId: '',
    lastTurnAt: 0,
    turnStartedAt: 0,
    // 注入回合记账（按回合 FIFO）：每次转交 agent 压一条 {injected, at}，
    // turn/start 取队首决定"这一回合的回复要不要拦"。
    pendingTurns: [],
    currentTurnInjected: false,
    turnSuppressedReply: false,
    turnActive: false,
  }
}
