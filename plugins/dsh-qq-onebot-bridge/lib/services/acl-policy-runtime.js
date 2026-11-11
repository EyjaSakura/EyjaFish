// ACL policy snapshot cache.
import { buildPolicyFromConfig } from '../acl-policy.js'
import { debugLog } from '../core/debug-log.js'

export function getAclPolicy({ cache, config, aclReader }) {
  const now = Date.now()
  if (cache.policy && now - cache.at < 5000) return cache.policy
  const enabled = config.aclEnabled !== false
  const { policy, source } = enabled
    ? aclReader()
    : { policy: null, source: 'disabled' }
  const resolved = policy ?? buildPolicyFromConfig(config)
  if (cache.source !== source) {
    debugLog(`acl policy source -> ${source}（roles=${Object.keys(resolved.roles ?? {}).length}`
      + ` assignments=${Object.keys(resolved.assignments ?? {}).length}）`)
  }
  cache.at = now
  cache.policy = resolved
  cache.source = source
  return resolved
}
