// 受限读工具注册：加载 dsh-tool-fs-jailed，并按权限追加共享只读区。
import { mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/** @param {any} args */
export async function registerJailedFsTools({
  agentCtx,
  role,
  key,
  surface = null,
  file,
  loadPlugin = (url) => import(url),
  sharedRoot,
  aclPolicy,
  logger,
  debugLog = () => {},
}) {
  // Owner already mounts the full standard preset; adding a second jailed
  // read tool would shadow that surface. Keep the jail for guest roles only.
  if (role?.guest === false) {
    debugLog(`${key}: jailed fs skipped for non-guest role`)
    return
  }
  try {
    if (!file) {
      logger?.warn('[权限模型] 受限读插件 dsh-tool-fs-jailed 没找到（该会话将无文件读取能力）；'
        + '可用 config.jailedFsPluginFile 显式指定路径')
      throw new Error('dsh-tool-fs-jailed not found')
    }
    const { apply: applyJailedFsTools } = await loadPlugin(pathToFileURL(file).href)
    const extraRoots = []
    if (surface?.sharedRead === true) {
      const dir = sharedRoot(aclPolicy())
      try {
        mkdirSync(dir, { recursive: true, mode: 0o700 })
        extraRoots.push({ prefix: 'shared', root: dir })
      } catch (error) {
        logger?.warn(`[权限模型] ${key}: 共享只读区不可用（${dir}）：${error?.message ?? error}`)
        debugLog(`${key}: shared dir unavailable: ${error?.message ?? error}`)
      }
    }
    applyJailedFsTools(agentCtx, { root: role.cwd, extraRoots })
    debugLog(`${key}: jailed read/glob/grep registered at ${role.cwd}`
      + `${extraRoots.length ? ` + ${extraRoots[0].prefix}/${extraRoots[0].root}` : '（无共享只读区权限）'} (plugin=${file})`)
  } catch (error) {
    logger?.warn(`[权限模型] ${key}: 注册受限读工具失败（该会话将无文件读取能力）：${error?.message ?? error}`)
    debugLog(`${key}: jailed fs plugin load failed: ${error?.stack ?? error}`)
  }
}
