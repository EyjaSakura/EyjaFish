// 工作区成员回填：把已有会话目录登记进客户端工作区。
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** @param {any} args */
export async function backfillWorkspaceMembership({
  workspaceStore,
  resolveRegistry,
  noteRegistryOnce,
  findEntity,
  sessionRootDir,
  setPending,
  workspaceProjectKey,
  trace,
  debugLog = () => {},
  attachLimit = 200,
}) {
  let bindings = {}
  try { bindings = workspaceStore.read() ?? {} } catch { return }
  const paths = new Map()
  for (const binding of Object.values(bindings)) {
    if (binding && typeof binding.path === 'string' && binding.path !== '') paths.set(binding.path, binding.title ?? '')
  }
  if (paths.size === 0) return
  for (const path of paths.keys()) {
    const registry = resolveRegistry()
    noteRegistryOnce(registry)
    if (registry === undefined || registry === null) {
      setPending(true)
      debugLog(`workspace backfill: workspaceRegistry 尚未激活，延后到下一次会话活动（path=${path}）`)
      return
    }
    const entity = await findEntity(registry, path)
    if (entity === undefined || entity === null) continue
    if (typeof entity.attachSession !== 'function') {
      debugLog(`workspace backfill: entity 没有 attachSession（path=${path}）`)
      continue
    }
    const dir = join(sessionRootDir, workspaceProjectKey(path))
    let names = []
    try {
      names = readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    } catch (error) {
      debugLog(`workspace backfill: 读不到项目目录 ${dir}: ${error?.message ?? error}`)
      continue
    }
    if (names.length === 0) {
      debugLog(`workspace backfill: 项目目录为空 ${dir}`)
      continue
    }
    const before = new Set(entity.sessionIds ?? [])
    const entries = []
    for (const name of names) {
      try { entries.push({ name, mtime: statSync(join(dir, name)).mtimeMs }) } catch { /* 跳过读不到的 */ }
    }
    entries.sort((a, b) => a.mtime - b.mtime)
    let added = 0
    let failed = 0
    for (const entry of entries.slice(0, attachLimit)) {
      try {
        await entity.attachSession(entry.name)
        if (before.has(entry.name) === false) added += 1
      } catch { failed += 1 }
    }
    setPending(false)
    if (added > 0 || failed > 0) {
      debugLog(`workspace backfill ${path}: +${added} attached, ${failed} skipped`)
      trace?.event({
        id: '', stage: 'workspace', ok: true, level: 'info',
        reason: `工作区回填「${path}」：新增登记 ${added} 条，跳过 ${failed} 条`,
        data: { path, added, skipped: failed, candidates: entries.length },
      })
    }
  }
}
