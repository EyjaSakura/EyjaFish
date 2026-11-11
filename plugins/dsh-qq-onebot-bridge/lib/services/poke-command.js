// 被动戳一戳：白名单/冷却检查 → 可选回戳（过闸门+配额）→ 可选补一句话。
/** @param {any} args */
export async function handlePoke({
  notice,
  config = {},
  now = Date.now(),
  lastPokeAt,
  checkPoke,
  planPoke,
  pickPokeText,
  engageOn,
  engageWriteBlocked,
  engageBlockedReason,
  pokeQuota,
  gate,
  server,
  saveEngageState,
  debugLog = () => {},
}) {
  const check = checkPoke({ notice, config, now, lastPokeAt })
  if (!check.ok) return { ok: false, reason: check.reason }
  const { isGroup, key } = check
  lastPokeAt.set(key, now)

  if (engageOn('pokeBackEnabled')) {
    if (engageWriteBlocked(notice)) return { ok: false, reason: engageBlockedReason('回戳') }
    const plan = planPoke({ groupId: isGroup ? notice.groupId : undefined, targetId: notice.userId })
    if (!plan.ok) return { ok: false, reason: `回戳未发出：${plan.reason}` }
    const quota = pokeQuota.check(key, now, '戳一戳')
    if (!quota.ok) return { ok: false, reason: `回戳未发出：${quota.reason}` }
    let gated
    try {
      gated = await gate.run(plan.action, key, `poke u${notice.userId}`, () => (isGroup
        ? server.groupPoke(notice.bot, plan.params.group_id, plan.params.user_id)
        : server.friendPoke(notice.bot, plan.params.user_id)))
    } catch (error) {
      return { ok: false, reason: `回戳失败：${error.message}` }
    }
    if (gated.ok !== true) return { ok: false, reason: `回戳被闸门拦下：${gated.reason}` }
    pokeQuota.record(key, now)
    saveEngageState()
  }

  const text = pickPokeText({ config, pokeBackEnabled: engageOn('pokeBackEnabled') })
  if (text !== '') {
    const targetId = isGroup ? notice.groupId : notice.userId
    await server.sendSegments(notice.bot, isGroup ? 'group' : 'private', targetId, [{ type: 'text', data: { text } }])
    debugLog(`poke replied (${isGroup ? `g${notice.groupId}` : `u${notice.userId}`})`)
  } else {
    debugLog(`poke back sent (${isGroup ? `g${notice.groupId}` : `u${notice.userId}`})`)
  }
  return { ok: true, reason: '' }
}
