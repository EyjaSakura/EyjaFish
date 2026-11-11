// 工作区成员登记：按路径找 entity，并把它 attachSession。
/** @param {any} args */
export async function findWorkspaceEntity({ registry, path, debugLog = () => {} }) {
  const why = []
  if (typeof registry?.resolveByPath === 'function') {
    try {
      const entity = await registry.resolveByPath(path)
      if (entity !== undefined && entity !== null) return entity
      why.push('resolveByPath=undefined')
    } catch (error) {
      why.push(`resolveByPath threw: ${error?.message ?? error}`)
    }
  } else {
    why.push('resolveByPath 不是函数')
  }
  if (typeof registry?.list === 'function') {
    try {
      const list = registry.list() ?? []
      why.push(`list=${list.length}`)
      const hit = list.find((workspace) => workspace?.path === path)
      if (hit !== undefined) return hit
      why.push(`list 中没有路径 ${path}`)
    } catch (error) {
      why.push(`list threw: ${error?.message ?? error}`)
    }
  } else {
    why.push('list 不是函数')
  }
  debugLog(`workspace lookup failed for ${path}: ${why.join(' | ')}`)
  return undefined
}

/** @param {any} args */
export async function ensureWorkspaceMembership({
  binding,
  sessionId,
  key = '',
  source = '',
  resolveRegistry,
  noteRegistryOnce,
  trace,
  debugLog = () => {},
}) {
  try {
    if (!binding || typeof binding.path !== 'string' || binding.path === '') return false
    const registry = resolveRegistry()
    noteRegistryOnce(registry)
    if (registry === undefined || registry === null) {
      debugLog(`workspace attach: workspaceRegistry 尚未激活（path=${binding.path}）`)
      return false
    }
    const entity = await findWorkspaceEntity({ registry, path: binding.path, debugLog })
    if (entity === undefined || entity === null) return false
    if (typeof entity.attachSession !== 'function') {
      debugLog(`workspace attach: entity 没有 attachSession（path=${binding.path}）`)
      return false
    }
    if ((entity.sessionIds ?? []).includes(sessionId)) return true
    await entity.attachSession(sessionId)
    debugLog(`workspace attach ${sessionId} -> ${binding.path} (${source})`)
    trace?.event({
      id: '', stage: 'workspace', ok: true, chatKey: key, level: 'info',
      reason: `会话并入工作区「${binding.title ?? binding.path}」：${sessionId.slice(0, 12)}`,
      data: { sessionId, path: binding.path, workspaceId: entity.id ?? '', source },
    })
    return true
  } catch (error) {
    debugLog(`workspace attach failed ${sessionId} -> ${binding.path}: ${error?.message ?? error}`)
    trace?.event({
      id: '', stage: 'workspace', ok: false, chatKey: key, level: 'warn',
      reason: `会话并入工作区失败（${binding?.title ?? binding?.path}）：${error?.message ?? error}`,
      data: { sessionId, path: binding?.path, source },
    })
    return false
  }
}
