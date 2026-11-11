// Jailed read-only filesystem tools for restricted roles.
import { fileURLToPath } from 'node:url'
import { localPluginCandidates, pickExistingFile } from '../paths.js'
import { registerJailedFsTools as registerJailedFsToolsService } from './jailed-fs.js'
import { debugLog } from '../core/debug-log.js'

export async function registerJailedFsTools({ bridge, agentCtx, role, key, surface = null }) {
  const repoRoot = fileURLToPath(new URL('..', import.meta.url))
  const candidates = localPluginCandidates('dsh-tool-fs-jailed', {
    repoRoot,
    cwd: bridge.config.cwd || process.cwd(),
    explicit: bridge.config.jailedFsPluginFile || '',
  })
  const file = pickExistingFile(candidates)
  if (!file) debugLog(`${key}: jailed fs candidates=${JSON.stringify(candidates)}`)
  return registerJailedFsToolsService({
    agentCtx,
    role,
    key,
    surface,
    file,
    loadPlugin: (url) => import(url),
    sharedRoot: (policy) => bridge.sharedRoot(policy),
    aclPolicy: () => bridge.aclPolicy(),
    logger: bridge.logger,
    debugLog,
  })
}
