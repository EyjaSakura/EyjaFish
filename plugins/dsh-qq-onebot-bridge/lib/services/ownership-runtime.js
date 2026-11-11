// Ownership-conflict resolution for a bound session.
import { resolveOwnershipConflict as resolveOwnershipConflictService } from './session-ownership.js'
import { debugLog } from '../core/debug-log.js'

export function resolveOwnershipConflictForBridge({ bridge, message, key, sessionId, error }) {
  return resolveOwnershipConflictService({
    message,
    key,
    sessionId,
    error,
    isWriterHeld: (e) => bridge.isWriterHeldFor(e),
    config: bridge.config,
    resumeSession: (m, k, id) => bridge.resumeSessionFor(m, k, id),
    bindSession: (k, id, src) => bridge.bindSessionFor(k, id, src),
    trace: bridge.trace,
    logger: bridge.logger,
    debugLog,
  })
}

export function resolveOwnershipConflict({ message, key, sessionId, error, config, isWriterHeld, resumeSession, bindSession, trace, logger }) {
  return resolveOwnershipConflictService({
    message,
    key,
    sessionId,
    error,
    isWriterHeld,
    config,
    resumeSession,
    bindSession,
    trace,
    logger,
    debugLog,
  })
}
