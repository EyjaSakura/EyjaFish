// Persist per-chat last-seen timestamps.
import { join } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'

export function markSeenForBridge({ bridge, key }) {
  try {
    const file = join(bridge.memoryDir, '..', 'qq-last-seen.json')
    let m = {}
    try { m = JSON.parse(readFileSync(file, 'utf8')) } catch { m = {} }
    m[key] = Date.now()
    writeFileSync(file, JSON.stringify(m), 'utf8')
  } catch { /* ignore */ }
}
