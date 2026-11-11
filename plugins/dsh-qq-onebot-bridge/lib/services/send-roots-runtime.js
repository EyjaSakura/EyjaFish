// Outbound send-root and per-user vision helpers.
import { dataRoot, usesNewLayout } from '../paths.js'
import { describeSendRoots, resolveSendPath } from '../send.js'

export function createSendRootsRuntime({ config, workspaceStore, exists, readFile }) {
  function sendSpec(role) {
    if (role?.guest) return { cwd: role.cwd, extraDirs: role.sendExtraDirs ?? [] }
    const extraDirs = [...(config.fileSendDirs ?? [])]
    if (usesNewLayout(config)) {
      const root = dataRoot(config)
      if (!extraDirs.includes(root)) extraDirs.push(root)
    }
    try {
      const data = workspaceStore.read() ?? {}
      for (const item of Object.values(data)) {
        if (item && typeof item.path === 'string' && item.path !== '' && !extraDirs.includes(item.path)) {
          extraDirs.push(item.path)
        }
      }
    } catch { /* best effort */ }
    return { cwd: config.cwd || process.cwd(), extraDirs }
  }

  function sendRoots(role) {
    return describeSendRoots(sendSpec(role))
  }

  function resolveSendPathFor(raw, role) {
    return resolveSendPath(raw, {
      ...sendSpec(role),
      maxBytes: config.fileSendMaxBytes,
    })
  }

  function userPerms(userId) {
    try {
      const file = config.perUserPermsFile
      if (!file || !exists(file)) return {}
      const all = JSON.parse(readFile(file, 'utf8').replace(/^\\uFEFF/, ''))
      return all[String(userId ?? '')] ?? {}
    } catch { return {} }
  }

  function visionOn(message) {
    return userPerms(message?.userId).vision !== false
  }

  return { sendSpec, sendRoots, resolveSendPath: resolveSendPathFor, userPerms, visionOn }
}
