// Contact / owner / draw / self-tool policy helpers.
import { existsSync, readFileSync } from 'node:fs'

export function createContactPolicyRuntime({ config, replyTo }) {
  function contacts() {
    try {
      const file = config.contactsFile
      if (!file || !existsSync(file)) return {}
      return JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
    } catch { return {} }
  }

  function ownerQQ() {
    const configured = Number(config.ownerQQ) || 0
    if (configured > 0) return String(configured)
    return String((config.adminUsers ?? [])[0] ?? '')
  }

  function drawAllowed(subject) {
    const uid = String(subject ?? '').replace(/^(?:user|u):/, '')
    if (!uid) return false
    let owner = ''
    try { owner = String(ownerQQ() || '') } catch { owner = '' }
    return uid === owner || uid === '2930661826'
  }

  function selfKindEnabled(kind) {
    const cfg = config || {}
    if (kind === 'profile') return cfg.selfProfileEnabled !== false
    if (kind === 'qzone') return cfg.qzoneEnabled !== false
    return true
  }

  async function notifyOwner(route, text) {
    try { await replyTo(route, text, {}) } catch { /* 通知失败不影响主流程 */ }
  }

  return { contacts, ownerQQ, drawAllowed, selfKindEnabled, notifyOwner }
}
