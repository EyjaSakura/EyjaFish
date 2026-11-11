// 戳一戳策略：白名单、目标、冷却，以及回戳后的文案选择。

/** @param {{ notice?: any, config?: any, now?: number, lastPokeAt?: Map<string, number> }} args */
export function checkPoke({ notice, config = {}, now = Date.now(), lastPokeAt = new Map() }) {
  const isGroup = notice.groupId !== undefined
  if (isGroup) {
    if (!(config.allowGroups ?? []).includes(notice.groupId)) return { ok: false, reason: '群不在 allowGroups 白名单', isGroup }
    if ((config.allowUsers ?? []).length > 0 && !(config.allowUsers ?? []).includes(notice.userId)) {
      return { ok: false, reason: '戳的人不在 allowUsers 白名单', isGroup }
    }
  } else if (!(config.allowUsers ?? []).includes(notice.userId)) {
    return { ok: false, reason: '私聊用户不在 allowUsers 白名单', isGroup }
  }
  if (notice.targetId !== undefined && notice.targetId !== (config.botQq ?? 0)) {
    return { ok: false, reason: '戳的目标不是机器人本人', isGroup }
  }
  const key = isGroup ? `poke:g:${notice.groupId}` : `poke:u:${notice.userId}`
  const cooldown = Math.max(5, Number(config.pokeCooldownSeconds) || 15) * 1000
  if (now - (lastPokeAt.get(key) ?? 0) < cooldown) {
    return { ok: false, reason: `戳一戳冷却中（${Math.round(cooldown / 1000)}s）`, isGroup, key }
  }
  return { ok: true, reason: '', isGroup, key, cooldown }
}

/** @param {{ config?: any, pokeBackEnabled?: boolean, random?: () => number }} args */
export function pickPokeText({ config = {}, pokeBackEnabled = false, random = Math.random }) {
  const configured = String(config.pokeBackText || '').trim()
  if (configured !== '') return configured
  if (pokeBackEnabled) return ''
  const replies = Array.isArray(config.pokeReplies) && config.pokeReplies.length > 0
    ? config.pokeReplies
    : ['别戳啦，小鲸鱼要吐泡泡了～']
  return replies[Math.floor(random() * replies.length)]
}
