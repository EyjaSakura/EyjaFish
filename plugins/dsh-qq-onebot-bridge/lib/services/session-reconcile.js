// 启动对账：扫描会话目录的 parentSession 链，把聊天绑到最新子会话。
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** @param {any} args */
export async function reconcileSessions({
  enabled = true,
  root,
  readHeaderAt,
  bindingTargets,
  syntheticMessage,
  roleOf,
  bindSession,
  logger,
  trace,
  debugLog = () => {},
  maxScan = 400,
  maxDepth = 10,
}) {
  if (enabled === false) return
  const childOf = new Map()
  let projects = []
  try {
    projects = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => join(root, d.name))
  } catch {
    return
  }
  let scanned = 0
  for (const project of projects) {
    let names = []
    try { names = readdirSync(project) } catch { continue }
    for (const name of names) {
      if (scanned >= maxScan) break
      const dir = join(project, name)
      let stat
      try { stat = statSync(dir) } catch { continue }
      if (!stat.isDirectory()) continue
      scanned += 1
      const header = readHeaderAt(dir)
      const parent = typeof header?.parentSession === 'string' ? header.parentSession : ''
      const id = typeof header?.id === 'string' ? header.id : name
      if (parent === '' || id === '') continue
      const list = childOf.get(parent) ?? []
      list.push({ id, mtime: stat.mtimeMs })
      childOf.set(parent, list)
    }
  }
  if (childOf.size === 0) return
  const targets = bindingTargets()
  for (const [key, sessionId] of targets) {
    const message = syntheticMessage(key)
    if (message === undefined) continue
    if (roleOf(message).guest === true) continue
    let current = sessionId
    const seen = new Set([current])
    for (let depth = 0; depth < maxDepth; depth += 1) {
      const kids = (childOf.get(current) ?? []).slice().sort((a, b) => b.mtime - a.mtime)
      if (kids.length === 0) break
      current = kids[0].id
      if (seen.has(current)) break
      seen.add(current)
    }
    if (current === sessionId) continue
    bindSession(key, current, 'reconcile')
    debugLog(`reconcile: ${key} ${sessionId} -> ${current}`)
    logger?.info(`QQ bridge reconciled ${key}: ${sessionId.slice(0, 8)} -> ${current.slice(0, 8)}`)
    trace?.event({
      id: '', stage: 'reconcile', ok: true, chatKey: key, level: 'info',
      reason: `启动对账 ${sessionId.slice(0, 12)} -> ${current.slice(0, 12)}`,
      data: { from: sessionId, to: current },
    })
  }
}
