// Effective model selection for an agent turn.
import { debugLog } from '../core/debug-log.js'

export function modelSelectionForBridge({ bridge }) {
  const fallback = bridge.ctx.agentDefaultModel.currentSelection()
  const selection = {
    provider: bridge.config.provider || fallback.provider,
    model: bridge.config.model || fallback.model,
  }
  debugLog(`model selection ${JSON.stringify(selection)}`)
  return selection
}
