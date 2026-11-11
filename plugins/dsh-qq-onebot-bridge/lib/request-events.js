// 入群/加好友请求：好友白名单自动处理、群申请入队与口令自动批准。
import { formatJoinPrompt } from './verify.js'

/** @param {any} args */
export async function onRequest({ request, bridge, debugLog = () => {} }) {
  if (bridge.stopped) return
  if (bridge.config.recordInbound !== false && request.__injected !== true && request.__replayed !== true) bridge.inbox.record('request', request)
  const trace = bridge.beginEventTrace('request', request)
  const mark = (stage, ok = true, reason = '', data = null, level = 'info') => trace?.mark(stage, { ok, reason, data, level })
  debugLog(`request ${request.requestType}/${request.subType} u${request.userId} g${request.groupId} flag=${String(request.flag).slice(0, 16)}`)

  if (request.requestType === 'friend') {
    const uid = String(request.userId)
    const allow = (bridge.config.allowUsers ?? []).map(String)
    const pass = allow.includes(uid)
    try {
      const r = await bridge.gate.run('set_friend_add_request', 'u:' + uid, 'friend_request', () => bridge.server.action(request.bot, 'set_friend_add_request', { flag: request.flag, approve: pass }))
      if (!r.ok) { mark('request', false, '自动处理被闸门拒绝：' + r.reason, null, 'warn'); return }
      mark('request', true, (pass ? '白名单内，已自动同意' : '白名单外，已自动拒绝') + ' u' + uid)
      if (pass) {
        bridge.identityBegin(uid, request.name || '')
        const allPending = bridge.identityAll()
        if (allPending[uid]) { allPending[uid].lastAsked = Date.now(); allPending[uid].asked = 1; bridge.identitySave(allPending) }
        try {
          await bridge.replyTo({ bot: request.bot, messageType: 'private', targetId: request.userId }, '你好呀，我是主人的猫娘。你是哪位？和主人是什么关系喵？', {})
        } catch { /* 问候失败不影响同意 */ }
      }
    } catch (error) {
      mark('request', false, '自动处理失败：' + error.message, null, 'warn')
    }
    return
  }

  if (!bridge.config.verifyEnabled) {
    mark('request', false, 'verifyEnabled=false，入群验证未开启（请求未入队）')
    return
  }
  try {
    if (request.requestType === 'group' && request.groupId && !bridge.config.allowGroups.includes(request.groupId)) {
      mark('request', false, `群 ${request.groupId} 不在 allowGroups 白名单`)
      return
    }
    const pending = bridge.joinGuard.addRequest({
      flag: request.flag,
      userId: request.userId,
      groupId: request.groupId,
      subType: request.subType,
      comment: request.comment,
      name: request.name ?? '',
    })
    if (!pending) {
      debugLog('join guard full, request ignored')
      mark('request', false, '待审批队列已满（verifyMaxPending）', null, 'warn')
      return
    }
    const keyword = String(bridge.config.verifyKeyword || '').trim()
    if (keyword && request.comment.includes(keyword)) {
      const ok = await bridge.resolveJoin(pending.entry, true, { offline: bridge.approvalOffline(request) })
      debugLog(`join request keyword auto-approve #${pending.id} → ${ok ? 'sent' : 'denied/kept pending'}`)
      mark('request', ok, ok ? `口令命中，自动批准 #${pending.id}` : `口令命中但写操作被闸门拒绝，仍待审批 #${pending.id}`, null, ok ? 'info' : 'warn')
      if (ok) await bridge.notify(`✅ 已按口令自动批准 #${pending.id}（${request.userId}）`)
      return
    }
    const prompt = formatJoinPrompt(pending.entry, { groupName: '' })
    const text = `${prompt}\n\n（把验证问题发给申请人，对方答对后回复 /同意 ${pending.id}）`
    await bridge.notifyAdmin(text)
    mark('request', true, `请求 #${pending.id} 已入队并推送管理员`)
    debugLog(`join request pending #${pending.id} u${request.userId}`)
    bridge.writeRuntimeSnapshot(true)
  } catch (error) {
    debugLog(`request handling failed: ${error.message}`)
    mark('request', false, `request 处理失败：${error.message}`, null, 'error')
  }
}
