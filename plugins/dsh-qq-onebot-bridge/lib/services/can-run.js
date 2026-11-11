// 能力判定：未知能力 / 全局开关 / ACL 决策。
/** @param {any} args */
export function canRun({
  message,
  capabilityId,
  options = {},
  config = {},
  subjectOfChat,
  subjectOfSender,
  aclPolicy,
  evaluate,
  capabilities,
  debugLog = () => {},
}) {
  const capability = capabilities.get(capabilityId)
  if (capability === undefined) {
    return { allowed: false, reason: 'unknown-capability', capabilityId, subject: '', decision: null, limits: {} }
  }
  if (capability.flag && config[capability.flag] === false) {
    return { allowed: false, reason: `能力开关关闭（${capability.flag}）`, capabilityId, subject: '', decision: null, limits: {} }
  }
  const subject = options.subject === 'chat' ? subjectOfChat(message) : subjectOfSender(message)
  const decision = evaluate(aclPolicy(), subject, {
    need: capability.need ?? [],
    limits: capability.limits ?? [],
  })
  if (decision.allowed !== true) {
    debugLog(`canRun deny ${capabilityId} subject=${subject} reason=${decision.reason}`
      + `${decision.missing.length ? ` missing=${decision.missing.join(',')}` : ''}`
      + `${decision.denied.length ? ` denied=${decision.denied.join(',')}` : ''}`)
  }
  return {
    allowed: decision.allowed,
    reason: decision.reason,
    capabilityId,
    subject,
    decision,
    limits: decision.limits,
  }
}
