// 角色权限 preset 与会话 preset 挂载：全部 best-effort，失败只记日志。

/** @param {any} args */
export function applyRolePermission({ handle, role, permissionPresets, resolveService, debugLog = () => {}, logger }) {
  const name = role?.permission
  if (name && permissionPresets?.set) {
    try {
      permissionPresets.set(handle.agent.session, name)
      debugLog(`role ${role.id}: permission preset -> ${name}`)
    } catch (error) {
      logger?.warn?.(`[本地补丁] 设置权限 preset ${name} 失败：${error?.message ?? error}`)
    }
  }
  // guest 不允许申请提权 → 审批策略 never（有该服务时才有效）。
  if (role?.guest) {
    const approval = resolveService('approval')
    for (const method of ['setApprovalPolicy', 'setPolicy']) {
      if (typeof approval?.[method] !== 'function') continue
      try {
        approval[method](method === 'setApprovalPolicy' ? handle.agent.session : handle.agent, 'never')
        debugLog(`role guest: approval policy -> never via ${method}()`)
        break
      } catch (error) {
        debugLog(`role guest: ${method}('never') failed: ${error?.message ?? error}`)
      }
    }
  }
}

/** @param {any} args */
export async function mountPreset({ agentCtx, presetId, where, resolveService, logger, debugLog = () => {} }) {
  if (!presetId) return
  const registry = resolveService('agentPresets')
  if (registry === undefined || typeof registry.mount !== 'function') {
    debugLog(`${where}: agentPresets unavailable (${registry === undefined ? 'undefined' : typeof registry}); skip preset ${presetId}`)
    logger?.warn?.(`[本地补丁] ${where}: agentPresets 服务不可用，QQ 会话将只有宿主级工具`)
    return
  }
  const tryList = [presetId, 'standard', 'default', 'ptc', 'coder']
  let lastErr = null
  for (const name of tryList) {
    try {
      const result = await registry.mount(agentCtx, name)
      debugLog(`${where}: mounted preset ${name} -> ${JSON.stringify(result)}`)
      return
    } catch (error) {
      lastErr = error
      debugLog(`${where}: mount preset ${name} failed: ${error?.message ?? error}`)
    }
  }
  logger?.warn?.(`[本地补丁] ${where} 所有 preset 都挂载失败，将只有宿主级工具：${lastErr?.message ?? lastErr}`)
}
