// Workspace runtime: bindings, registry cache, session listing, /ws command,
// and opening a workspace session. Bridge keeps only wiring wrappers.
import { basename, join } from 'node:path'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { workspaceSessions as workspaceSessionsService } from './workspace-sessions.js'
import { workspaceSessionBusy as workspaceSessionBusyService, formatWorkspaceList as formatWorkspaceListService } from './workspace-list.js'
import { handleWorkspaceCommand as handleWorkspaceCommandService } from './workspace-command.js'
import { openWorkspaceSession as openWorkspaceSessionService } from './workspace-open.js'
import { debugLog } from '../core/debug-log.js'

export function createWorkspaceRuntime({
  workspaceStore,
  sessionRootDir,
  workspaceRegistryFile,
  getCache,
  setCache,
  canRun,
  routeKey,
  safeReply,
  roleOf,
  disposeSession,
  resumeSession,
  bindSession,
  resolveOwnershipConflict,
  createSession,
  logger,
}) {
  function workspaceBinding(key) {
    try {
      const data = workspaceStore.read()
      const item = data ? data[key] : null
      if (!item || typeof item.path !== 'string' || item.path === '') return null
      return {
        title: typeof item.title === 'string' && item.title !== '' ? item.title : basename(item.path),
        path: item.path,
        sessionId: typeof item.sessionId === 'string' ? item.sessionId : '',
      }
    } catch (error) {
      debugLog(`workspace binding read failed: ${error.message}`)
      return null
    }
  }

  function setWorkspaceBinding(key, binding) {
    try {
      workspaceStore.mutate((data) => { data[key] = binding })
    } catch (error) {
      debugLog(`workspace binding write failed: ${error.message}`)
    }
  }

  function clearWorkspaceBinding(key) {
    try {
      workspaceStore.mutate((data) => { delete data[key] })
    } catch { /* best effort */ }
  }

  function canSwitchWorkspace(message) {
    return canRun(message, 'cmd.workspace').allowed
  }

  function readWorkspaceRegistry() {
    const now = Date.now()
    const cache = getCache()
    if (now - cache.at < 5000) return cache.list
    const list = []
    try {
      const raw = JSON.parse(readFileSync(workspaceRegistryFile, 'utf8'))
      const table = raw?.tables?.workspaces ?? {}
      for (const item of Object.values(table)) {
        if (!item || typeof item.path !== 'string' || item.path === '') continue
        list.push({
          path: item.path,
          title: typeof item.title === 'string' && item.title !== '' ? item.title : basename(item.path),
          sessionIds: Array.isArray(item.sessionIds) ? item.sessionIds.filter((id) => typeof id === 'string') : [],
        })
      }
    } catch (error) {
      debugLog(`workspace registry read failed: ${error.message}`)
    }
    list.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'))
    setCache({ at: now, list })
    return list
  }

  function matchWorkspace(arg, list) {
    const want = String(arg).trim()
    if (want === '') return null
    if (/^\d+$/.test(want)) {
      const index = Number(want)
      return index >= 1 && index <= list.length ? list[index - 1] : null
    }
    const lower = want.toLowerCase()
    const exact = list.find((ws) => ws.title.toLowerCase() === lower || ws.path.toLowerCase() === lower)
    if (exact) return exact
    const hits = list.filter((ws) => ws.title.toLowerCase().includes(lower) || ws.path.toLowerCase().includes(lower))
    return hits.length === 1 ? hits[0] : null
  }

  function findSessionDir(sessionId) {
    if (typeof sessionId !== 'string' || sessionId === '') return ''
    try {
      for (const name of readdirSync(sessionRootDir)) {
        const dir = join(sessionRootDir, name, sessionId)
        try {
          if (statSync(dir).isDirectory()) return dir
        } catch { /* not under this project key */ }
      }
    } catch { /* session root missing */ }
    return ''
  }

  function workspaceSessions(ws) {
    return workspaceSessionsService({
      ws,
      sessionRoot: sessionRootDir,
      findSessionDir: (id) => findSessionDir(id),
    })
  }

  function workspaceSessionBusy(sessionId) {
    return workspaceSessionBusyService({
      dir: findSessionDir(sessionId),
      exists: existsSync,
    })
  }

  function formatWorkspaceList(key, list) {
    return formatWorkspaceListService({
      list,
      binding: workspaceBinding(key),
      sessionsOf: (ws) => workspaceSessions(ws),
    })
  }

  async function handleWorkspaceCommand(message, text) {
    return handleWorkspaceCommandService({
      message,
      text,
      routeKey: routeKey(message),
      canSwitch: (m) => canSwitchWorkspace(m),
      readRegistry: () => readWorkspaceRegistry(),
      formatList: (key, list) => formatWorkspaceList(key, list),
      getBinding: (key) => workspaceBinding(key),
      clearBinding: (key) => clearWorkspaceBinding(key),
      disposeSession: (key) => disposeSession(key),
      matchWorkspace: (arg, list) => matchWorkspace(arg, list),
      workspaceSessions: (target) => workspaceSessions(target),
      workspaceSessionBusy: (id) => workspaceSessionBusy(id),
      setBinding: (key, binding) => setWorkspaceBinding(key, binding),
      safeReply: (m, t) => safeReply(m, t),
    })
  }

  async function openWorkspaceSession(message, key, binding) {
    return openWorkspaceSessionService({
      message,
      key,
      binding,
      roleOf: (m) => roleOf(m),
      clearBinding: (k) => clearWorkspaceBinding(k),
      sessionRoot: sessionRootDir,
      sessionsOf: (ws) => workspaceSessions(ws),
      resumeSession: (m, k, id) => resumeSession(m, k, id),
      bindSession: (k, id) => bindSession(k, id),
      resolveOwnershipConflict: (m, k, id, err) => resolveOwnershipConflict(m, k, id, err),
      createSession: (m, k, opts) => createSession(m, k, opts),
      logger,
      debugLog,
    })
  }

  return {
    workspaceBinding,
    setWorkspaceBinding,
    clearWorkspaceBinding,
    canSwitchWorkspace,
    readWorkspaceRegistry,
    matchWorkspace,
    findSessionDir,
    workspaceSessions,
    workspaceSessionBusy,
    formatWorkspaceList,
    handleWorkspaceCommand,
    openWorkspaceSession,
  }
}
