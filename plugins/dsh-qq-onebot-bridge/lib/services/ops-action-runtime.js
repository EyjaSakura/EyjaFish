// Shared OneBot action error translation and ops wrapper.
import { debugLog } from '../core/debug-log.js'

export function actionErrorReason(error, label) {
  const text = String(error?.message ?? error ?? '')
  if (/get Uid Error|:\s*1200\b/.test(text)) {
    return `${label}失败：NapCat 解析不到这个号的 uid——他很可能不在这个群里（或不是真实 QQ 号）。请用 @ 选中群内成员，或写他真实的 QQ 号`
  }
  if (/:\s*(1400|1401|1403|1404)\b/.test(text) || /permission|not admin|权限/i.test(text)) {
    return `${label}失败：机器人可能不是本群管理员（或群内权限不足）`
  }
  return `${label}失败：${text.slice(0, 160)}`
}

export async function runOpsAction({ bridge, message, label, run }) {
  try {
    return await run()
  } catch (error) {
    const reason = actionErrorReason(error, label)
    await bridge.safeReply(message, `⚠️ ${reason}`)
    bridge.trace?.event({ id: '', stage: 'ops', ok: false, level: 'warn', reason })
    debugLog(`${label} action failed: ${error?.message ?? error}`)
    return null
  }
}
