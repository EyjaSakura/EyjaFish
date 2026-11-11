// One-shot ACL database bootstrap from the current config.
import { openAclStore } from '../acl-store.js'
import { pathOf } from '../paths.js'
import { existsSync } from 'node:fs'

export function bootstrapAcl({ config, logger }) {
  const note = ''
  try {
    const aclFile = config.aclDbFile || pathOf(config, 'acl')
    if (config.aclEnabled !== false && config.aclBootstrap === true && !existsSync(aclFile)) {
      const store = openAclStore(aclFile)
      try {
        store.syncPermissions()
        const roles = store.seedBuiltinRoles()
        const rows = store.importAssignmentsFromConfig(config)
        store.audit({ actor: 'bridge-bootstrap', action: 'bootstrap', target: aclFile, after: { roles, rows } })
        const message = `已用当前配置初始化 ACL 库：${aclFile}（内置角色 ${roles}，分配 ${rows} 条）`
        logger.warn(`[权限模型] ${message}`)
        return message
      } finally {
        store.close()
      }
    }
  } catch (error) {
    logger.warn(`[权限模型] ACL 库初始化失败（继续走配置翻译）：${error?.message ?? error}`)
  }
  return note
}
