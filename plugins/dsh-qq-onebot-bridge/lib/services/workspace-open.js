// 进入工作区会话：恢复最近会话或新建。
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { workspaceProjectKey } from '../core/workspace-key.js'

/** @param {any} args */
export async function openWorkspaceSession({
  message,
  key,
  binding,
  roleOf,
  clearBinding,
  sessionRoot,
  sessionsOf,
  resumeSession,
  bindSession,
  resolveOwnershipConflict,
  createSession,
  logger,
  debugLog = () => {},
  exists = existsSync,
}) {
  const role = roleOf(message)
  if (role.guest) {
    // 双保险：guest 永远不进入工作区会话（即使状态文件被改过）。
    clearBinding(key)
    throw new Error('guest 不允许使用工作区会话')
  }
  const expectedDir = join(sessionRoot, workspaceProjectKey(binding.path))
  const sessions = sessionsOf({ path: binding.path, sessionIds: [] })
  const inWorkspace = (id) => sessions.some((item) => item.id === id) || exists(join(expectedDir, id))
  const wanted = binding.sessionId !== '' && inWorkspace(binding.sessionId)
    ? binding.sessionId
    : (sessions[0]?.id ?? '')
  if (wanted !== '') {
    try {
      const entry = await resumeSession(message, key, wanted)
      bindSession(key, entry.sessionId)
      logger?.info(`QQ bridge workspace ${binding.path}: resumed ${entry.sessionId} for ${key}`)
      debugLog(`workspace resumed ${entry.sessionId} for ${key} (${binding.path})`)
      return entry
    } catch (error) {
      debugLog(`workspace resume failed (${binding.path} / ${wanted}): ${error.message}`)
      const resolved = await resolveOwnershipConflict(message, key, wanted, error)
      if (resolved !== undefined) return resolved
    }
  }
  const entry = await createSession(message, key, { cwd: binding.path })
  bindSession(key, entry.sessionId)
  logger?.info(`QQ bridge workspace ${binding.path}: created ${entry.sessionId} for ${key}`)
  return entry
}
