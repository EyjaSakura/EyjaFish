// 人格服务：从配置/文件解析某个会话生效的人格文本。
// 纯服务层，不依赖桥接内核；缓存由调用方传入。
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const BUILTIN_PERSONA = 'You are a helpful assistant.'

/** 归一化 persona 配置：兼容缺省、非对象、空白字符串等脏输入。 */
export function personaConfig(config) {
  const raw = config?.persona
  const base = raw && typeof raw === 'object' ? raw : {}
  const str = (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : '')
  const chats = {}
  if (base.chats && typeof base.chats === 'object') {
    for (const [chatKey, value] of Object.entries(base.chats)) {
      const text = str(value)
      if (text !== '') chats[String(chatKey)] = text
    }
  }
  return {
    enabled: base.enabled !== false,
    dir: str(base.dir),
    defaultText: str(base.default),
    owner: str(base.owner),
    guest: str(base.guest),
    extra: str(base.extra),
    chats,
  }
}

/** 读人格文件（带 mtime+size 缓存）；不存在/读不了返回空串。 */
export function personaFile(config, name, cache) {
  const { dir } = personaConfig(config)
  if (dir === '' || !name) return ''
  const file = join(dir, name)
  try {
    const stat = statSync(file)
    if (!stat.isFile()) return ''
    const cached = cache.get(file)
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.text
    const text = readFileSync(file, 'utf8').trim()
    cache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, text })
    return text
  } catch {
    return ''
  }
}

/** chatKey 里的 `:` 等字符不能直接进文件名。 */
export function personaChatFileName(key) {
  return `chat-${String(key).replace(/[^\w-]/g, '_')}.md`
}

/** 解析某个会话最终生效的人格文本。 */
export function resolvePersona({ config, role, key, cache, fallback = BUILTIN_PERSONA }) {
  const cfg = personaConfig(config)
  if (!cfg.enabled) return { text: '', source: 'disabled' }
  const roleId = role?.guest === true ? 'guest' : 'owner'
  const chatFile = personaChatFileName(key)
  const roleFile = `${roleId}.md`

  let identity = ''
  let source = ''
  const fromFile = (name, label) => {
    const text = personaFile(config, name, cache)
    if (text !== '') { identity = text; source = `file:${label}`; return true }
    return false
  }
  const fromConfig = (text, label) => {
    if (text !== '') { identity = text; source = `config:${label}`; return true }
    return false
  }

  if (!fromFile(chatFile, chatFile)
    && !fromConfig(cfg.chats[key] ?? '', `chats.${key}`)
    && !fromFile(roleFile, roleFile)
    && !fromConfig(roleId === 'guest' ? cfg.guest : cfg.owner, roleId)
    && !fromFile('default.md', 'default.md')
    && !fromConfig(cfg.defaultText, 'default')) {
    identity = fallback
    source = 'builtin'
  }

  const extra = personaFile(config, 'extra.md', cache)
  if (extra !== '') return { text: `${identity}\n\n${extra}`, source: `${source}+file:extra.md` }
  if (cfg.extra !== '') return { text: `${identity}\n\n${cfg.extra}`, source: `${source}+config:extra` }
  return { text: identity, source }
}
