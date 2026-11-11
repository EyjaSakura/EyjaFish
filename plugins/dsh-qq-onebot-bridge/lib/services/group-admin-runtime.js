// Group-admin write block with TTL freshness.
export function botAdminBlockedReason({ groupId, known, knownAt, ttl }) {
  const key = Number(groupId)
  if (known.get(key) !== false) return ''
  const at = knownAt.get(key) ?? 0
  const age = Date.now() - at
  if (age > ttl) return ''
  return `我已被取消群 ${groupId} 的管理员（group_admin 事件，${Math.max(0, Math.round(age / 60000))} 分钟前），这类写操作会失败；请先恢复我的管理员权限`
}
