// 打开会话：优先工作区绑定，其次续接持久会话，最后新建。
// 依赖通过 host 注入，便于单测。

export async function openSession({ message, key, host }) {
  const binding = host.workspaceBinding(key)
  if (binding) {
    try {
      return await host.openWorkspaceSession(message, key, binding)
    } catch (error) {
      // 占用冲突必须向上抛，否则会走到下面的"新建会话"兜底 → 又变成 fork。
      if (error?.dshSessionConflict === true) throw error
      host.debugLog(`workspace session open failed (${binding.path}): ${error.message}`)
      host.logger.warn(`[本地补丁] 工作区会话打开失败（${binding.path}）：${error.message}`)
    }
  }

  const stored = host.config.sessionResumeEnabled === false ? '' : host.storedSessionId(key)
  if (stored) {
    try {
      const entry = await host.resumeSession(message, key, stored)
      host.logger.info(`QQ bridge resumed session ${entry.sessionId.slice(0, 8)} for ${key}`)
      host.debugLog(`session resumed ${entry.sessionId} for ${key}`)
      return entry
    } catch (error) {
      host.debugLog(`session resume failed (${stored}): ${error.message}`)
      const resolved = await host.resolveOwnershipConflict(message, key, stored, error)
      if (resolved !== undefined) return resolved
      host.forgetSession(key)
    }
  }
  return host.createSession(message, key)
}
