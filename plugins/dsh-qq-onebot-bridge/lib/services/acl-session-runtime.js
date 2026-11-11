// ACL session audit record.
import { recordAclSession as recordAclSessionService } from './acl-session-record.js'

export function createAclSessionRuntime({ config, pathOf, exists, openStore, rolesFor, getPolicy, debugLog }) {
  function record(entry, surface, kind = 'created') {
    return recordAclSessionService({
      entry,
      surface,
      kind,
      config,
      pathOf,
      exists,
      openStore,
      rolesFor,
      aclPolicy: () => getPolicy(),
      debugLog,
    })
  }

  return { record }
}
