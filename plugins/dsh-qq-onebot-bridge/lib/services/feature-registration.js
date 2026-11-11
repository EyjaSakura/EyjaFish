// Feature-backed tool registration wrappers. The actual features live in
// D:\DSH\plugins\features; bridge only injects its API surface.
import { buildContactsSection as buildContactsSectionService } from './contacts-section.js'
import { registerFaceTools as registerFaceToolsModule } from '../tools/face-tools.js'
import { debugLog } from '../core/debug-log.js'

export function registerSingTools({ features, defineTool, agentCtx, route, key, bridge }) {
  const feature = features.get('registerSingTools')
  if (!feature) { debugLog('[feature] registerSingTools 未加载，功能已停用'); return }
  return feature({ defineTool, agentCtx, route, key, bridge })
}

export function registerMediaTools({ features, defineTool, agentCtx, route, key, role, bridge }) {
  const feature = features.get('registerMediaTools')
  if (!feature) { debugLog('[feature] registerMediaTools 未加载，功能已停用'); return }
  return feature({ defineTool, agentCtx, route, key, role, bridge })
}

export function registerQueryTools({ features, defineTool, agentCtx, route, key, role, bridgeApi }) {
  const feature = features.get('registerQueryTools')
  if (!feature) { debugLog('[feature] registerQueryTools 未加载，功能已停用'); return }
  return feature({ agentCtx, route, key, role, defineTool, debugLog, bridge: bridgeApi({}) })
}

export function registerContactsSection({ agentCtx, config, contacts, ownerQQ }) {
  if (!agentCtx?.systemPrompt?.section) return
  const built = buildContactsSectionService({ config: config || {}, contacts, ownerQQ })
  if (!built) return
  agentCtx.systemPrompt.section({ name: 'qq-contacts', order: 0.7, text: built.text })
  debugLog('[contacts] injected ' + built.count + ' entries')
}

export function registerOwnerTools({ features, defineTool, agentCtx, route, key, role, bridge }) {
  const feature = features.get('registerOwnerTools')
  if (!feature) { debugLog('[feature] registerOwnerTools 未加载，功能已停用'); return }
  return feature({ agentCtx, route, key, role, defineTool, debugLog, bridge })
}

export function registerSelfTools({ features, defineTool, agentCtx, route, key, role, bridge }) {
  const feature = features.get('registerSelfTools')
  if (!feature) { debugLog('[feature] registerSelfTools 未加载，功能已停用'); return }
  return feature({ agentCtx, route, key, role, defineTool, debugLog, bridge })
}

export function registerFaceTools({ agentCtx, route, defineTool, bridge, chatKeyOf, linkSticker }) {
  return registerFaceToolsModule({
    agentCtx,
    route,
    defineTool,
    bridge,
    chatKeyOf,
    linkSticker,
  })
}
