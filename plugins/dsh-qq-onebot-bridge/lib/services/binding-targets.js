// 收集已绑定会话的 chatKey → sessionId：
// 工作区绑定优先，会话表补齐缺失项。

/** @param {any} args */
export function collectBindingTargets({ workspaceStore, sessionStore, debugLog = () => {} } = {}) {
  const targets = new Map()
  try {
    const bindings = workspaceStore?.read() ?? {}
    for (const [key, binding] of Object.entries(bindings)) {
      if (binding !== null && typeof binding === 'object' && typeof binding.sessionId === 'string' && binding.sessionId !== '') {
        targets.set(key, binding.sessionId)
      }
    }
  } catch (error) {
    debugLog(`binding targets: workspace store read failed: ${error.message}`)
  }
  try {
    const stored = sessionStore?.read() ?? {}
    for (const [key, sessionId] of Object.entries(stored)) {
      if (typeof sessionId === 'string' && sessionId !== '' && targets.has(key) === false) targets.set(key, sessionId)
    }
  } catch (error) {
    debugLog(`binding targets: session store read failed: ${error.message}`)
  }
  return targets
}
