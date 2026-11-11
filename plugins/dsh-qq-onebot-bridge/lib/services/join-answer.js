/**
 * @param {{ message: any, text: string, joinGuard: any, checkVerifyAnswer: (entry: any, text: string) => boolean, resolveJoin: (entry: any, approve: boolean, opts: any) => Promise<boolean>, safeReply: (message: any, text: string) => Promise<any>, notify: (text: string) => Promise<any>, approvalOffline: (message: any) => boolean, debugLog?: (message: string) => void }} args
 */
// 申请人回答验证题：只认真正发过题目的 pending 条目，答对才放行。
export async function handleJoinAnswer({
  message,
  text,
  joinGuard,
  checkVerifyAnswer,
  resolveJoin,
  safeReply,
  notify,
  approvalOffline,
  debugLog = () => {},
}) {
  const pending = joinGuard.list().find((entry) => entry.userId === message.userId && entry.adopted !== true && String(entry.question ?? '') !== '')
  if (!pending) return false
  if (!checkVerifyAnswer(pending, text)) {
    if (/^[^\d]{0,6}\d{1,4}[^\d]{0,3}$/.test(text)) {
      await safeReply(message, `❌ 答案不对哦，再想想：${pending.question}`)
    }
    return true
  }
  const ok = await resolveJoin(pending, true, { offline: approvalOffline(message) })
  if (ok) {
    await safeReply(message, '✅ 验证通过，已放行～')
    await notify(`✅ 申请人 ${message.userId} 答对验证题，#${pending.id} 已放行`)
    debugLog(`join answer accepted #${pending.id}`)
  }
  return true
}
