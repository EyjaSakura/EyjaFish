// Notify up to 3 admins in private.
import { debugLog } from '../core/debug-log.js'

export async function notifyAdmin({ bridge, text }) {
  const admins = Array.isArray(bridge.config.adminUsers) ? bridge.config.adminUsers : []
  const socket = bridge.server.currentSocket()
  if (!socket || admins.length === 0) {
    debugLog('no admin to notify')
    return
  }
  for (const admin of admins.slice(0, 3)) {
    try {
      await bridge.server.sendSegments(socket, 'private', admin, [{ type: 'text', data: { text } }])
    } catch (error) {
      debugLog(`admin notify failed (${admin}): ${error.message}`)
    }
  }
}
