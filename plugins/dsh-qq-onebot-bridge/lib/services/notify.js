// 推送通知：pushplus 兼容 webhook，带冷却与“配置缺失只提示一次”。

/** @param {{ config?: any, fetchImpl?: any, now?: () => number, debugLog?: (message: string) => void, trace?: any }} args */
export function createNotifier({ config = {}, fetchImpl = fetch, now = () => Date.now(), debugLog = () => {}, trace = null }) {
  let lastAt = -Infinity
  let warned = false

  function send(text) {
    if (!config.notifyEnabled) return undefined
    if (!config.notifyPushUrl && !config.notifyToken) {
      debugLog('notify skipped: no push url/token')
      if (warned !== true) {
        warned = true
        trace?.event({ id: '', stage: 'notify', ok: false, level: 'warn', reason: '推送通知未发送：notifyEnabled=true 但没配 notifyPushUrl / notifyToken（本进程只提示这一次）' })
      }
      return undefined
    }

    const at = now()
    const cooldown = Math.max(30, Number(config.notifyCooldownSeconds) || 300) * 1000
    if (at - lastAt < cooldown) return undefined
    lastAt = at

    const url = config.notifyPushUrl || 'http://www.pushplus.plus/send'
    const payload = config.notifyToken
      ? { token: config.notifyToken, title: '小鲸鱼', content: text }
      : { title: '小鲸鱼', content: text }

    return Promise.resolve().then(() => fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    })).then((response) => {
      debugLog(`notify sent status=${response.status}`)
    }).catch((error) => {
      debugLog(`notify failed: ${error.message}`)
    })
  }

  return { send }
}
