// Adapter-owned QQ notification. No memory-core import.
/**
 * @param {{ bridge?: any, text?: string }} args
 */
export async function notifyOwner({ bridge, text }) {
  const owner = String(bridge?.ownerQQ?.() ?? bridge?.config?.ownerQQ ?? '')
  if (!owner) throw new Error('owner QQ unavailable')
  const socket = bridge?.server?.currentSocket?.()
  if (!socket) throw new Error('no OneBot socket')
  if (typeof bridge.server.sendText !== 'function') throw new Error('server.sendText unavailable')
  await bridge.server.sendText(socket, 'private', Number(owner), String(text ?? ''))
}
