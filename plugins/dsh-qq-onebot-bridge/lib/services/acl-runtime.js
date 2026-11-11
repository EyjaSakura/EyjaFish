// ACL capability check for a message.
import { canRun as canRunService } from './can-run.js'
import { evaluate } from '../acl.js'
import { CAPABILITY_BY_ID } from '../capabilities.js'
import { debugLog } from '../core/debug-log.js'

export function subjectOfSender(message) {
  return `user:${message?.userId ?? ''}`
}

export function subjectOfChat(message) {
  if (message?.messageType === 'group') {
    const id = message?.groupId ?? message?.targetId ?? ''
    return `group:${id}`
  }
  const id = message?.userId ?? message?.targetId ?? ''
  return `user:${id}`
}

export function writeGate({ bridge, route, capabilityId }) {
  const result = bridge.canRun(route, capabilityId, { subject: 'chat' })
  if (result.allowed === true) return ''
  debugLog(`write gate deny ${capabilityId} subject=${result.subject} reason=${result.reason}`)
  return `权限不足：本会话没有 ${capabilityId} 权限（主体 ${result.subject}，原因 ${result.reason}）`
}

export function chatLimits({ bridge, route, keys }) {
  try {
    return evaluate(bridge.aclPolicy(), subjectOfChat(route), { limits: keys }).limits
  } catch {
    return {}
  }
}

export function canRunForBridge({ bridge, message, capabilityId, options }) {
  return canRunService({
    message,
    capabilityId,
    options,
    config: bridge.config,
    subjectOfChat: (m) => bridge.subjectOfChatFor(m),
    subjectOfSender: (m) => bridge.subjectOfSenderFor(m),
    aclPolicy: () => bridge.aclPolicy(),
    evaluate,
    capabilities: CAPABILITY_BY_ID,
    debugLog,
  })
}
