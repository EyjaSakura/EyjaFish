// 把会话快照写进 ACL 库（aclEnabled 且库存在时）。
/** @param {any} args */
export function recordAclSession({
  entry,
  surface,
  kind = 'created',
  config = {},
  pathOf,
  exists,
  openStore,
  rolesFor,
  aclPolicy,
  debugLog = () => {},
}) {
  if (config.aclEnabled === false) return
  try {
    const file = config.aclDbFile || pathOf(config, 'acl')
    if (!exists(file)) return
    const subject = surface?.subject ?? ''
    const store = openStore(file, { create: false })
    try {
      store.recordSession({
        subjectId: subject,
        sessionId: entry.sessionId,
        roles: rolesFor(aclPolicy(), subject),
        surface: {
          kind,
          key: entry.key,
          readonly: surface?.readonly === true,
          needRestrict: surface?.needRestrict === true,
          allowedTools: surface?.inheritedTools ?? [],
          scoped: surface?.scoped ?? {},
          at: new Date().toISOString(),
        },
      })
    } finally {
      store.close()
    }
  } catch (error) {
    debugLog(`record session snapshot failed: ${error?.message ?? error}`)
  }
}
