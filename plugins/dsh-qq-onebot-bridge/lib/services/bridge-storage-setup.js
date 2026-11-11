// Persistent stores and watchdog files.
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { pathOf } from '../paths.js'
import { HistoryArchive } from '../archive.js'
import { JsonStore } from '../store.js'

function dshHomeDir() {
  const fromEnv = process.env.DSH_HOME
  return typeof fromEnv === 'string' && fromEnv !== '' ? resolve(fromEnv) : join(homedir(), '.dsh')
}

export function createStorageState({ config }) {
  const archive = config.historyArchiveEnabled === false
    ? null
    : new HistoryArchive({
        dir: config.historyArchiveDir || pathOf(config, 'history'),
        keepDays: Math.max(1, Number(config.historyArchiveKeepDays) || 90),
      })
  const sessionFile = pathOf(config, 'sessions')
  const workspaceFile = pathOf(config, 'workspaces')
  const dshHome = dshHomeDir()
  return {
    archive,
    sessionFile,
    sessionStore: new JsonStore(sessionFile, { fallback: {} }),
    workspaceFile,
    workspaceStore: new JsonStore(workspaceFile, { fallback: {} }),
    dshHome,
    sessionRootDir: process.env.QQ_WORKSPACE_SESSION_ROOT || join(dshHome, 'sessions'),
    workspaceRegistryFile: process.env.QQ_WORKSPACE_REGISTRY || join(dshHome, 'storages', 'workspace.json'),
    watchdogIncidentFile: config.watchdogIncidentFile || pathOf(config, 'watchdogIncidents'),
    watchdogAlertStateFile: config.watchdogAlertStateFile || pathOf(config, 'watchdogAlert'),
    workspaceCache: { at: 0, list: [] },
  }
}
