// 身份/角色解析：把配置归一化成 owner/guest 两个角色与 roleFor 决策。
// 纯工厂，路径与角色归一化函数由调用方注入。

/** @param {any} args */
export function buildIdentityConfig({ config = {}, pathOf, subjectDir, normalizeRoleId, env = process.env }) {
  const raw = config.identity ?? {}
  const roles = raw.roles ?? {}
  const ownerSpec = roles.owner ?? {}
  const guestSpec = roles.guest ?? {}
  const enabled = raw.enabled === true

  const owner = {
    id: 'owner',
    guest: false,
    systemUser: ownerSpec.systemUser ?? (env.USER || env.USERNAME || 'owner'),
    preset: ownerSpec.preset ?? 'qq-coding',
    fullPreset: ownerSpec.preset ?? 'qq-coding',
    permission: ownerSpec.permission ?? config.permissionPreset,
    cwd: ownerSpec.cwd ?? config.cwd,
    sendExtraDirs: config.fileSendDirs,
  }
  const guest = {
    id: 'guest',
    guest: true,
    systemUser: guestSpec.systemUser ?? 'qqguest',
    preset: guestSpec.preset ?? 'qq-readonly',
    permission: guestSpec.permission,
    cwd: guestSpec.cwd ?? pathOf(config, 'guestRoot'),
    fullPreset: guestSpec.fullPreset ?? 'qq-coding',
    readonlyPreset: guestSpec.readonlyPreset ?? 'qq-readonly',
    sendExtraDirs: [],
  }

  const perSubjectDirs = raw.perSubjectDirs !== false
  const subjectIdOf = (message) => (message?.messageType === 'group'
    ? `group:${message?.groupId ?? ''}`
    : `user:${message?.userId ?? ''}`)
  const guestFor = (message) => (perSubjectDirs
    ? { ...guest, subjectId: subjectIdOf(message), cwd: subjectDir(config, subjectIdOf(message)) }
    : guest)

  const pickRole = (id) => (normalizeRoleId(id) === 'admin' ? owner : guest)
  const pickRoleFor = (id, message) => {
    const role = pickRole(id)
    return role.guest ? guestFor(message) : role
  }

  const map = raw.map ?? {}
  const groupRoles = {}
  if (raw.groupRoles && typeof raw.groupRoles === 'object') {
    for (const [groupId, roleId] of Object.entries(raw.groupRoles)) {
      const key = String(groupId).trim()
      if (key === '') continue
      groupRoles[key] = normalizeRoleId(roleId)
    }
  }

  return {
    enabled,
    owner,
    guest,
    groupRoles,
    roleFor: (message) => {
      try {
        const ownerQq = String(config.ownerQq || config.owner || (config.adminUsers ?? [])[0] || '')
        if (ownerQq && String(message?.userId) === ownerQq) return owner
      } catch { /* ignore */ }
      if (!enabled) return owner
      if (message?.messageType === 'group') {
        const groupId = message?.groupId === undefined || message?.groupId === null ? '' : String(message.groupId)
        const byGroup = groupId === '' ? undefined : groupRoles[groupId]
        if (byGroup !== undefined) return pickRoleFor(byGroup, message)
        return pickRoleFor(raw.groupRole ?? 'guest', message)
      }
      const mapped = map[String(message?.userId)]
      if (mapped !== undefined) return pickRoleFor(mapped, message)
      return pickRoleFor(raw.defaultRole ?? 'guest', message)
    },
  }
}
