// Apply storage state produced by createStorageState.
export function applyStorageState(bridge, s) {
  bridge.archive = s.archive
  bridge.sessionFile = s.sessionFile
  bridge.sessionStore = s.sessionStore
  bridge.workspaceFile = s.workspaceFile
  bridge.workspaceStore = s.workspaceStore
  bridge.dshHome = s.dshHome
  bridge.sessionRootDir = s.sessionRootDir
  bridge.workspaceRegistryFile = s.workspaceRegistryFile
  bridge.watchdogIncidentFile = s.watchdogIncidentFile
  bridge.watchdogAlertStateFile = s.watchdogAlertStateFile
  bridge.workspaceCache = s.workspaceCache
}
