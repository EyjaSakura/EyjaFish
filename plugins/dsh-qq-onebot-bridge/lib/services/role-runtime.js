// Role directory and permission preset application.
import { mkdirSync } from 'node:fs'
import { applyRolePermission as applyRolePermissionCore, mountPreset as mountPresetCore } from '../core/agent-mounting.js'
import { debugLog } from '../core/debug-log.js'

export function ensureRoleCwd({ role, logger }) {
  if (!role?.cwd) return
  try {
    mkdirSync(role.cwd, { recursive: true, mode: 0o700 })
  } catch (error) {
    logger.warn(`[本地补丁] 创建角色目录 ${role.cwd} 失败：${error?.message ?? error}`)
  }
}

export function applyRolePermissionForBridge({ bridge, handle, role }) {
  return applyRolePermission({
    handle,
    role,
    permissionPresets: bridge.ctx.permissionPresets,
    resolveService: (name) => bridge.resolveServiceFor(name),
    logger: bridge.logger,
  })
}

export function presetForSurface(role, surface) {
  return surface.requiresFullPreset
    ? (role.fullPreset || role.preset || 'qq-coding')
    : (role.readonlyPreset || 'qq-readonly')
}

export async function mountPresetForBridge({ bridge, agentCtx, presetId, where }) {
  return mountPreset({
    agentCtx,
    presetId,
    where,
    resolveService: (name) => bridge.resolveServiceFor(name),
    logger: bridge.logger,
  })
}

export async function mountPreset({ agentCtx, presetId, where, resolveService, logger }) {
  return mountPresetCore({
    agentCtx,
    presetId,
    where,
    resolveService,
    logger,
    debugLog,
  })
}

export function applyRolePermission({ handle, role, permissionPresets, resolveService, logger }) {
  return applyRolePermissionCore({
    handle,
    role,
    permissionPresets,
    resolveService,
    debugLog,
    logger,
  })
}
