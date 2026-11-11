// Tool-surface self-check and shared read-only root resolution.
import { TOOL_GRANTS } from '../tool-grants.js'

const TOOL_GRANTS_FOR_CHECK = TOOL_GRANTS.filter((item) => (item.tools ?? []).length > 0)
import { sharedDir, dataRoot } from '../paths.js'
import { isAbsolute, join } from 'node:path'
import { debugLog } from '../core/debug-log.js'

export function toolSurfaceSelfCheck(agentCtx, surface, key) {
  const tools = agentCtx?.tools
  const leaked = []
  for (const grant of TOOL_GRANTS_FOR_CHECK) {
    const decision = surface.decisions?.[grant.perm]
    if (decision?.allowed === true) continue
    for (const name of grant.tools) {
      let visible = false
      try { visible = tools?.get?.(name, agentCtx) !== undefined } catch { visible = false }
      if (visible) leaked.push(name)
    }
  }
  if (leaked.length > 0) {
    debugLog(`tool surface ${key}: 有未授权工具仍可见（调用会被 guard 拒绝）：${leaked.join(', ')}`)
  } else {
    debugLog(`tool surface ${key}: 自检通过（未授权工具都不可见）`)
  }
}

export function resolveSharedRoot({ config, policy = null }) {
  const uri = String(policy?.resources?.['dir:shared']?.uri ?? '').trim()
  if (uri === '') return sharedDir(config)
  return isAbsolute(uri) ? uri : join(dataRoot(config), uri)
}
