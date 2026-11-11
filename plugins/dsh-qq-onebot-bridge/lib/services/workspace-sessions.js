// 扫描某个工作区目录下的会话（按最近修改时间倒序）。
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { workspaceProjectKey } from '../core/workspace-key.js'

export function workspaceSessions({ ws, sessionRoot, findSessionDir }) {
  const found = new Map()
  const dir = join(sessionRoot, workspaceProjectKey(ws.path))
  try {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      let stat
      try { stat = statSync(full) } catch { continue }
      if (!stat.isDirectory()) continue
      let mtime = stat.mtimeMs
      try {
        for (const file of readdirSync(full)) {
          if (!file.startsWith('session.') || file === 'session.lock') continue
          try { mtime = Math.max(mtime, statSync(join(full, file)).mtimeMs) } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
      found.set(name, mtime)
    }
  } catch { /* 该工作区还没有会话目录 */ }
  // 登记表里的会话兜底（路径大小写/改名等导致 projectKey 对不上时）。
  for (const id of ws.sessionIds ?? []) {
    if (found.has(id)) continue
    const hit = findSessionDir(id)
    if (hit === '') continue
    try { found.set(id, statSync(hit).mtimeMs) } catch { /* ignore */ }
  }
  return [...found.entries()]
    .map(([id, mtime]) => ({ id, mtime }))
    .sort((a, b) => b.mtime - a.mtime)
}
