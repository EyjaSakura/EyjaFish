// Session turn counting and forced rotation.
import { createSessionTurnsStore } from './session-turns.js'
import { debugLog } from '../core/debug-log.js'

export function createTurnRuntime({ config, routeKey, sessions, forgetSession, logger }) {
  let store = null
  function sessionTurns() {
    store ??= createSessionTurnsStore({ file: 'C:\\Users\\Eyjafjalla\\qq-session-turns.json' })
    return store
  }

  function countTurn(message, entry) {
    try {
      if (!message || message.__injected === true) return
      const key = routeKey(message)
      const sessionId = String((entry && entry.sessionId) || '')
      const max = Math.max(2, Number(config.sessionMaxTurns) || 60)
      const { rotate, oldId } = sessionTurns().count({
        key, sessionId, turnActive: entry?.turnActive === true, max,
      })
      if (rotate) {
        sessions.delete(key)
        forgetSession(key)
        debugLog('[session-rotate] key=' + key + ' turns=' + max + ' -> new session (old ' + oldId + ')')
        try {
          logger.info('[session-rotate] ' + key + ' 已换新会话（旧 ' + oldId.slice(0, 8) + '，阈值 ' + max + '）')
        } catch { /* ignore */ }
      }
    } catch (error) {
      debugLog('[session-rotate] failed: ' + error.message)
    }
  }

  function forceRotate(key) {
    try { sessions.delete(key) } catch { /* ignore */ }
    forgetSession(key)
    sessionTurns().reset(key)
  }

  return { countTurn, forceRotate, sessionTurns }
}
