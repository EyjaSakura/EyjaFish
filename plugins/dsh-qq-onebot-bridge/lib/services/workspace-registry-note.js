// One-time diagnostic for the workspace registry service.
import { debugLog } from '../core/debug-log.js'

export function noteWorkspaceRegistryOnce({ bridge, registry }) {
  if (bridge.workspaceRegistryNoted === true) return
  bridge.workspaceRegistryNoted = true
  if (registry === undefined) {
    debugLog('workspaceRegistry unavailable: QQ sessions will NOT be registered into workspace.sessionIds')
    bridge.trace?.event({
      id: '', stage: 'workspace', ok: false, level: 'warn',
      reason: 'workspaceRegistry 服务取不到：QQ 会话无法自动登记进工作区成员表（其它功能不受影响）',
    })
  } else {
    let shape = ''
    try {
      shape = `resolveByPath=${typeof registry.resolveByPath} list=${typeof registry.list}`
      const listed = typeof registry.list === 'function' ? (registry.list() ?? []) : null
      if (listed !== null) shape += ` listCount=${listed.length} paths=${JSON.stringify(listed.slice(0, 6).map((w) => w?.path))}`
    } catch (error) {
      shape += ` shapeProbeFailed=${error?.message ?? error}`
    }
    debugLog(`workspaceRegistry resolved via ${bridge.workspaceRegistryVia ?? '?'}: ${shape}`)
  }
}
