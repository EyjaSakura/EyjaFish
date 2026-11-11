// 新建/续接会话：角色、工具面、preset、agent handle、注册与绑定的编排。
// 依赖通过 host 注入，便于单测。

/** @param {any} args */
export async function createSession({ message, key, opts = {}, host }) {
  const { cwd = '', parentSession = '' } = opts
  const route = host.routeOf(message)
  const selection = host.modelSelection()
  const role = host.roleOf(message)
  host.ensureRoleCwd(role)
  const surface = host.toolSurface(message)
  const preset = host.presetForSurface(role, surface)
  const sessionCwd = cwd !== '' ? cwd : role.cwd

  const handle = await host.createAgent({
    sessionId: host.freshSessionId(host.sessionPrefix(key)),
    meta: {
      ...(sessionCwd ? { cwd: sessionCwd } : {}),
      ...(parentSession !== '' ? { parentSession } : {}),
      agentPreset: preset,
    },
    agentOptions: selection,
    setup: async (agentCtx) => {
      await host.mountPreset(agentCtx, preset, `创建会话 ${key}`)
      await host.installSession(agentCtx, route, key, { resumed: false, role, surface })
    },
  })

  host.applyRolePermission(handle, role)
  const entry = host.registerSession(key, route, handle, { resumed: false })
  host.bindSession(key, entry.sessionId)
  host.recordAclSession(entry, surface, 'created')
  host.logger.info(`QQ bridge created session ${entry.sessionId.slice(0, 8)} for ${key}`
    + ` (role=${role.id} preset=${preset} tools=${surface.inheritedTools.length}${surface.needRestrict ? ' restricted' : ''})`)
  host.debugLog(`tool surface ${key}: ${host.explainToolSurface(surface)}`)
  return entry
}

export async function resumeSession({ message, key, sessionId, host }) {
  const route = host.routeOf(message)
  const selection = host.modelSelection()
  const role = host.roleOf(message)
  host.ensureRoleCwd(role)
  const resumeSurface = host.toolSurface(message)

  // 安全：guest 绝不复用旧会话（旧会话可能带 scoped 工具，restrict 屏蔽不了）。
  if (role.guest) {
    host.debugLog(`guest ${key}: refuse to resume ${sessionId} (stale preset tools); creating a fresh session instead`)
    host.logger.info(`QQ bridge: guest ${key} 不复用旧会话，改为新建（只读角色安全策略）`)
    return host.createSession(message, key)
  }

  const handle = await host.resumeAgent({
    resumeSessionId: host.brandSessionId(sessionId),
    agentOptions: selection,
    setup: async (agentCtx) => {
      await host.mountPreset(agentCtx, host.presetForSurface(role, resumeSurface), `续接会话 ${key} -> ${sessionId}`)
      await host.installSession(agentCtx, route, key, { resumed: true, role, surface: resumeSurface })
    },
  })

  host.applyRolePermission(handle, role)
  const entry = host.registerSession(key, route, handle, { resumed: true })
  host.recordAclSession(entry, resumeSurface, 'resumed')
  return entry
}
