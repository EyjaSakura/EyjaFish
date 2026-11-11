// Startup warning for "whole group is owner" dev groups.
import { normalizeRoleId } from '../acl-policy.js'
import { debugLog } from '../core/debug-log.js'

export function reportDevGroups({ config, logger, identityConfig }) {
  try {
    const raw = config.identity ?? {}
    if (raw.perSubjectDirs !== false && raw.roles?.guest?.cwd) {
      logger.warn(`[本地补丁] identity.roles.guest.cwd=${raw.roles.guest.cwd} 被忽略：`
        + 'perSubjectDirs 默认开启，guest 目录按主体派生（要回旧行为就设 identity.perSubjectDirs: false）')
    }
  } catch { /* 配置形状脏数据，忽略 */ }
  let devGroups = []
  try {
    const { groupRoles } = identityConfig()
    devGroups = Object.entries(groupRoles ?? {})
      .filter(([, roleId]) => normalizeRoleId(roleId) === 'admin')
      .map(([groupId]) => groupId)
  } catch (error) {
    debugLog(`dev groups scan failed: ${error?.message ?? error}`)
    return
  }
  if (devGroups.length === 0) return
  logger.warn(`[本地补丁] 开发群已启用（整群 owner 全权限，群里任何人都等于主人）：${devGroups.join(', ')}`)
  debugLog(`dev groups (owner role, whole group): ${devGroups.join(', ')}`)
}
