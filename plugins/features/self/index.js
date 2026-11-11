import { register as registerProfile } from './tools/profile.js'
import { register as registerBili } from './tools/bili.js'
import { register as registerFace } from './tools/face.js'
import { register as registerQzone } from './tools/qzone.js'

export function registerSelfTools({ agentCtx, route, key, role, bridge, defineTool, debugLog }) {
  debugLog('[self-tools] enter key=' + key + ' guest=' + String(role?.guest) + ' roleKeys=' + Object.keys(role || {}).join(','))
  const uid = String(role?.subjectId || '').replace(/^(?:u|user):/, '') || String(route?.targetId ?? '')
  const admins = (bridge.config.adminUsers ?? []).map(String)
  const isAdmin = admins.includes(uid)
  debugLog('[self-tools] admin check uid=' + uid + ' isAdmin=' + isAdmin)
  if (!isAdmin) { debugLog('[self-tools] skip: not admin'); return }

  const call = async (action, params) => {
    const socket = bridge.server.currentSocket()
    if (!socket) throw new Error('当前没有可用的 OneBot 连接（QQ 掉线）')
    return bridge.server.action(socket, action, params)
  }
  const out = {
    schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true }, detail: { type: 'string', required: true } } },
    render: (_a, v) => [{ type: 'text', text: v.detail }],
  }
  const ctx = { agentCtx, route, key, role, bridge, defineTool, debugLog, call, out, uid, isAdmin }
  registerProfile(ctx)
  registerBili(ctx)
  registerFace(ctx)
  registerQzone(ctx)
}

export const hooks = { registerSelfTools }
