// 自动抽取自 bridge.js #handleOpsCommand
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, unlinkSync, statSync } from 'node:fs'
import { join, basename, dirname, extname } from 'node:path'
import * as qqSdk from '@zfqxuz/dsh-qq-onebot-bridge/lib/sdk/index.js'

const {
  INVITE_POLICIES, batchTargets,
  formatWeeklyReport, invitePolicyLabel, normalizeTargets,
  parseInvitePolicy, parseOpsArgs, parseToggle, planAddOption,
  planGroupAdmin, planGroupSign, planHistoryVisibility, planInvitePolicy, planKickMembers,
  planMemberPermissions, planProfileChange, planTodo,
} = qqSdk

import { handleOpsAlbum, handleOpsFileOps, handleOpsReadOnly, handleOpsRequestSync } from './ops-subcommands.js'

export async function handleOpsCommand({ message, text, bridge, defineTool, debugLog }) {
  const raw = String(text ?? '').trim()
  if (!/^[\/／](群打卡|全体余量|禁言名单|群详细|入群通知|批量踢|待办|完成待办|取消待办|周报|移动文件|重命名文件|删文件|新建文件夹|传图|群名|群备注|群权限|历史可见|打卡名册|管理员名单|设管理|撤管理|邀请策略|加群方式|申请)(?:\s|$)/.test(raw)) return false
  if (bridge.config.groupOpsEnabled !== true) {
    await bridge.safeReply(message, '🧰 群运营工具箱未启用（groupOpsEnabled=false）')
    bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: 'groupOpsEnabled=false，群运营命令不执行' })
    return true
  }
  const isGroup = message.messageType === 'group'
  const groupId = message.groupId
  const chatKey = isGroup ? `g:${groupId}` : `u:${message.userId}`
  const injected = bridge.engageWriteBlocked(message)
  const isAdmin = bridge.config.adminEnabled && bridge.isAdmin(message)
  const needGroup = async () => {
    await bridge.safeReply(message, '🧰 这个命令只能在群里用。')
    bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: '不是群聊消息，群运营命令不适用' })
    return true
  }

  // 权限自愈（v0.5.8）：group_admin 事件已经明确告诉我们"已被撤管理员"时，
  // **写命令**直接说真话，不要让 API 去撞墙（用户只会看到一句模糊的失败）。
  // 只读查询与 /群打卡 不在拦截范围——它们不需要管理员权限。
  if (/^[\/／](批量踢|待办|完成待办|取消待办|移动文件|重命名文件|删文件|新建文件夹|传图|群名|群备注|群权限|历史可见|设管理|撤管理|邀请策略|加群方式)(?:\s|$)/.test(raw)) {
    const blocked = bridge.botAdminBlockedReason(groupId)
    if (blocked !== '') {
      await bridge.safeReply(message, `⚠️ ${blocked}`)
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: blocked })
      return true
    }
  }

  // —— /群打卡：QQ 原生群签到（与本地 /签到 积分游戏是两件事）——
  if (/^[\/／]群打卡\s*$/.test(raw)) {
    if (!isGroup) return needGroup()
    if (bridge.config.nativeSignEnabled !== true) {
      await bridge.safeReply(message, '📅 原生群打卡未启用（nativeSignEnabled=false）。提示：本地的「签到」是积分玩法，与 QQ 群打卡无关。')
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: 'nativeSignEnabled=false' })
      return true
    }
    if (injected) {
      await bridge.safeReply(message, `📅 群打卡未执行：${bridge.engageBlockedReason('群打卡')}`)
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: bridge.engageBlockedReason('群打卡') })
      return true
    }
    const plan = planGroupSign({ groupId })
    if (!plan.ok) {
      await bridge.safeReply(message, `⚠️ 群打卡失败：${plan.reason}`)
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: plan.reason })
      return true
    }
    const gated = await bridge.gate.run(plan.action, chatKey, 'native sign', () => bridge.server.groupSign(message.bot, plan.params.group_id))
    if (gated.ok !== true) {
      await bridge.safeReply(message, `⚠️ 群打卡被闸门拦下：${gated.reason}`)
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: gated.reason })
      return true
    }
    bridge.countOps('sign')
    await bridge.safeReply(message, `📅 已在群 ${groupId} 打卡${gated.dryRun === true ? '（干跑：没有真的发到 QQ）' : ''}`)
    bridge.trace?.event({ id: '', stage: 'ops', ok: true, reason: `群打卡已发出（${plan.action}）` })
    return true
  }

  if (await handleOpsReadOnly({ message, raw, bridge, isGroup, groupId, injected, needGroup })) return true

  // —— /批量踢 <@某人|QQ…> 然后 /批量踢 确认（原生批量，二次确认）——
  if (/^[\/／]批量踢(?:\s|$)/.test(raw)) {
    if (!isGroup) return needGroup()
    if (bridge.config.opsKickEnabled !== true) {
      await bridge.safeReply(message, '🥾 批量踢未启用（opsKickEnabled=false）')
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: 'opsKickEnabled=false' })
      return true
    }
    if (!isAdmin) {
      await bridge.safeReply(message, '⚠️ 批量踢仅管理员可用。')
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: '批量踢仅管理员可用' })
      return true
    }
    const parsed = parseOpsArgs(raw, `${raw.slice(0, 1)}批量踢`)
    const arg = parsed.ok ? parsed.arg : ''
    const confirmed = /(^|\s)确认$/.test(arg)

    // 先处理「确认」：此时参数里没有目标，目标来自待确认记录。
    // （刻意不用「确认踢」这个裸词——那是单人踢的确认词，会被既有的 /kick 二次确认拦走。）
    if (confirmed) {
      const pending = bridge.pendingKickBatch.get(chatKey)
      if (!pending || pending.expiresAt < Date.now()) {
        await bridge.safeReply(message, '⚠️ 没有待确认的批量踢（或已超时 60 秒），请重新发一次 /批量踢 @某人 …')
        bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: '批量踢确认时没有待处理记录或已超时' })
        return true
      }
      if (injected) {
        await bridge.safeReply(message, `🥾 批量踢未执行：${bridge.engageBlockedReason('批量踢')}`)
        bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: bridge.engageBlockedReason('批量踢') })
        return true
      }
      const batches = batchTargets(pending.userIds, bridge.config.opsKickBatchSize)
      let kicked = 0
      const failures = []
      for (const batch of batches) {
        const plan = planKickMembers({ groupId, userIds: batch, max: bridge.config.opsKickBatchSize })
        if (!plan.ok) {
          failures.push(plan.reason)
          continue
        }
        try {
          const gated = await bridge.gate.run(plan.action, chatKey, `batch u${batch.length}`, () => bridge.server.kickGroupMembers(message.bot, plan.params.group_id, plan.params.user_id, plan.params.reject_add_request))
          if (gated.ok === true) kicked += batch.length
          else failures.push(gated.reason)
        } catch (error) {
          failures.push(error.message)
        }
      }
      bridge.pendingKickBatch.delete(chatKey)
      bridge.countOps('kick', kicked)
      const summary = kicked > 0 ? `✅ 已移出 ${kicked}/${pending.userIds.length} 人（${batches.length} 批）` : '⚠️ 一个都没踢出去'
      await bridge.safeReply(message, failures.length > 0 ? `${summary}\n失败原因：${failures.slice(0, 3).join('；')}` : summary)
      bridge.trace?.event({ id: '', stage: 'ops', ok: kicked > 0, reason: `批量踢完成：${kicked}/${pending.userIds.length} 人，${batches.length} 批${failures.length > 0 ? `，失败 ${failures.length} 批` : ''}` })
      return true
    }

    // 目标 = @ 到的人 + 参数里的 QQ 号
    const ats = (message.ats ?? []).map((qq) => String(qq)).filter((qq) => qq !== String(bridge.config.botQq ?? ''))
    const fromText = normalizeTargets(arg)
    const valid = [...new Set([...ats, ...fromText.valid])]
    const invalid = fromText.invalid
    if (valid.length === 0) {
      await bridge.safeReply(message, '🥾 用法：/批量踢 @某人 @另一个人 …（可加 QQ 号），确认时发 /批量踢 确认')
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: '批量踢没有解析到目标' })
      return true
    }
    const self = String(message.userId)
    if (valid.includes(self)) {
      await bridge.safeReply(message, '⚠️ 名单里有你自己，请去掉后重试。')
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: '批量踢名单包含发起人自己' })
      return true
    }
    bridge.pendingKickBatch.set(chatKey, { userIds: valid, expiresAt: Date.now() + 60_000 })
    const warn = invalid.length > 0 ? `⚠️ 这些不是合法 QQ 号，已忽略：${invalid.join('、')}\n` : ''
    await bridge.safeReply(message, `${warn}🥾 确认要把这 ${valid.length} 人移出本群？\n${valid.join('、')}\n60 秒内发送「/批量踢 确认」执行。`)
    bridge.trace?.event({ id: '', stage: 'ops', ok: true, reason: `批量踢等待确认（${valid.length} 人）` })
    return true
  }

  // —— /待办 /完成待办 /取消待办（引用一条消息）——
  if (/^[\/／](待办|完成待办|取消待办)(?:\s|$)/.test(raw)) {
    if (!isGroup) return needGroup()
    if (bridge.config.opsTodoEnabled !== true) {
      await bridge.safeReply(message, '📌 群待办未启用（opsTodoEnabled=false）')
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: 'opsTodoEnabled=false' })
      return true
    }
    const kind = raw.includes('取消待办') ? 'cancel' : raw.includes('完成待办') ? 'complete' : 'set'
    const quoted = String(message.reply?.messageId ?? '')
    if (quoted === '') {
      await bridge.safeReply(message, '📌 用法：引用一条消息，再发 /待办、/完成待办 或 /取消待办')
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: '群待办需要引用一条消息（没有 message_id）' })
      return true
    }
    if (injected) {
      await bridge.safeReply(message, `📌 群待办未执行：${bridge.engageBlockedReason('群待办')}`)
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: bridge.engageBlockedReason('群待办') })
      return true
    }
    const plan = planTodo({ groupId, kind, messageId: quoted })
    if (!plan.ok) {
      await bridge.safeReply(message, `⚠️ 群待办失败：${plan.reason}`)
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: plan.reason })
      return true
    }
    const gated = await bridge.gate.run(plan.action, chatKey, `todo ${kind} ${quoted}`, () => bridge.server.groupTodo(message.bot, kind, { groupId: plan.params.group_id, messageId: plan.params.message_id ?? '', messageSeq: plan.params.message_seq ?? '' }))
    if (gated.ok !== true) {
      await bridge.safeReply(message, `⚠️ 群待办被闸门拦下：${gated.reason}`)
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: gated.reason })
      return true
    }
    bridge.countOps('todo')
    const label = kind === 'set' ? '已设为群待办' : kind === 'complete' ? '已标记完成' : '已取消群待办'
    await bridge.safeReply(message, `📌 ${label}（消息 ${quoted}）${gated.dryRun === true ? '（干跑：没有真的发到 QQ）' : ''}`)
    bridge.trace?.event({ id: '', stage: 'ops', ok: true, reason: `${label}（${plan.action}）` })
    return true
  }

  // —— /周报：本地计数，不访问 QQ ——
  if (/^[\/／]周报\s*$/.test(raw)) {
    if (!isGroup) return needGroup()
    if (bridge.config.opsReportEnabled !== true) {
      await bridge.safeReply(message, '📈 群运营周报未启用（opsReportEnabled=false）')
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: 'opsReportEnabled=false' })
      return true
    }
    const days = Math.max(1, Number(bridge.config.opsReportDays) || 7)
    const stats = bridge.opsCounters.totals({ days })
    const series = bridge.opsCounters.series({ days })
    const extra = [`· 表情回应统计：${bridge.reactions.size} 条消息有记录`]
    await bridge.safeReply(message, formatWeeklyReport({ stats, series, days, groupId, extra }))
    bridge.trace?.event({ id: '', stage: 'ops', ok: true, reason: `周报：本地计数 ${days} 天（只读本地 JSON，不访问 QQ）` })
    return true
  }

  if (await handleOpsFileOps({ message, raw, bridge, isGroup, groupId, chatKey, injected, isAdmin, needGroup })) return true

  if (await handleOpsAlbum({ message, raw, bridge, isGroup, groupId, chatKey, injected, isAdmin, needGroup })) return true

  // —— /群名 <新名> /群备注 <备注>（管理员）——
  if (/^[\/／](群名|群备注)(?:\s|$)/.test(raw)) {
    if (!isGroup) return needGroup()
    if (bridge.config.opsProfileEnabled !== true) {
      await bridge.safeReply(message, '🏷 群资料修改未启用（opsProfileEnabled=false）')
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: 'opsProfileEnabled=false' })
      return true
    }
    if (!isAdmin) {
      await bridge.safeReply(message, '⚠️ 群资料修改仅管理员可用。')
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: '群资料修改仅管理员可用' })
      return true
    }
    const kind = raw.includes('群备注') ? 'remark' : 'name'
    const cmd = `${raw.slice(0, 1)}${kind === 'remark' ? '群备注' : '群名'}`
    const parsed = parseOpsArgs(raw, cmd)
    const plan = planProfileChange({ groupId, kind, value: parsed.ok ? parsed.arg : '' })
    if (!plan.ok) {
      await bridge.safeReply(message, `⚠️ 修改失败：${plan.reason}`)
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: plan.reason })
      return true
    }
    if (injected) {
      await bridge.safeReply(message, `🏷 群资料未修改：${bridge.engageBlockedReason('群资料修改')}`)
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: bridge.engageBlockedReason('群资料修改') })
      return true
    }
    const gated = await bridge.gate.run(plan.action, chatKey, kind, () => bridge.server.setGroupProfile(message.bot, kind, { groupId: plan.params.group_id, value: plan.params.group_name ?? plan.params.remark ?? '' }))
    if (gated.ok !== true) {
      await bridge.safeReply(message, `⚠️ 修改被闸门拦下：${gated.reason}`)
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: gated.reason })
      return true
    }
    const value = plan.params.group_name ?? plan.params.remark ?? ''
    await bridge.safeReply(message, `🏷 已把群${kind === 'name' ? '名' : '备注'}改成「${value}」${gated.dryRun === true ? '（干跑：没有真的发到 QQ）' : ''}`)
    bridge.trace?.event({ id: '', stage: 'ops', ok: true, reason: `群${kind === 'name' ? '名' : '备注'}已更新（${plan.action}）` })
    return true
  }

  // —— /群权限 相册=关 临时会话=关 新群聊=开 · /历史可见 开|关（管理员）——
  // 名字刻意不叫「/成员权限」：`/成员` 命令支持紧贴写法（/成员张三），会把「/成员权限 …」整条吃掉。
  if (/^[\/／](群权限|历史可见)(?:\s|$)/.test(raw)) {
    if (!isGroup) return needGroup()
    if (bridge.config.opsPolicyEnabled !== true) {
      await bridge.safeReply(message, '⚙ 入群与发言策略未启用（opsPolicyEnabled=false）')
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: 'opsPolicyEnabled=false' })
      return true
    }
    if (!isAdmin) {
      await bridge.safeReply(message, '⚠️ 策略修改仅管理员可用。')
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: '策略修改仅管理员可用' })
      return true
    }
    if (raw.includes('历史可见')) {
      const parsed = parseOpsArgs(raw, `${raw.slice(0, 1)}历史可见`)
      const toggle = parseToggle(parsed.ok ? parsed.arg : '')
      const plan = planHistoryVisibility({ groupId, visible: toggle === null ? undefined : toggle })
      if (!plan.ok) {
        await bridge.safeReply(message, `⚠️ 修改失败：${plan.reason}（用法：/历史可见 开 或 /历史可见 关）`)
        bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: plan.reason })
        return true
      }
      if (injected) {
        await bridge.safeReply(message, `⚙ 策略未修改：${bridge.engageBlockedReason('发言策略')}`)
        bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: bridge.engageBlockedReason('发言策略') })
        return true
      }
      const gated = await bridge.gate.run(plan.action, chatKey, `visible=${plan.params.visible}`, () => bridge.server.setGroupNewMemberHistoryVisibility(message.bot, plan.params.group_id, plan.params.visible))
      if (gated.ok !== true) {
        await bridge.safeReply(message, `⚠️ 修改被闸门拦下：${gated.reason}`)
        bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: gated.reason })
        return true
      }
      await bridge.safeReply(message, `⚙ 新成员${plan.params.visible ? '可以' : '不能'}看到入群前的聊天记录${gated.dryRun === true ? '（干跑：没有真的发到 QQ）' : ''}`)
      bridge.trace?.event({ id: '', stage: 'ops', ok: true, reason: `历史可见性已设为 ${plan.params.visible}` })
      return true
    }
    const parsed = parseOpsArgs(raw, `${raw.slice(0, 1)}群权限`)
    const arg = parsed.ok ? parsed.arg : ''
    const readOne = (label) => {
      // 备选分支必须用 (?:…) 分组，否则 `临时会话|临时` 会变成「整个模式」的二选一，
      // 前半支没有取值部分 → 该项被静默丢掉（实测踩过）。
      const hit = new RegExp(`(?:${label})\\s*[=＝:]\\s*(\\S+)`).exec(arg)
      if (!hit) return undefined
      const toggle = parseToggle(hit[1])
      return toggle === null ? undefined : toggle
    }
    const plan = planMemberPermissions({
      groupId,
      uploadAlbum: readOne('相册'),
      temporarySession: readOne('临时会话|临时'),
      createGroup: readOne('新群聊|建群'),
    })
    if (!plan.ok) {
      await bridge.safeReply(message, `⚠️ 修改失败：${plan.reason}\n用法：/群权限 相册=关 临时会话=关 新群聊=开（只改写出来的项）`)
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: plan.reason })
      return true
    }
    if (injected) {
      await bridge.safeReply(message, `⚙ 策略未修改：${bridge.engageBlockedReason('成员权限')}`)
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: bridge.engageBlockedReason('成员权限') })
      return true
    }
    const gated = await bridge.gate.run(plan.action, chatKey, Object.keys(plan.params).slice(1).join(','), () => bridge.server.setGroupMemberPermissions(message.bot, plan.params))
    if (gated.ok !== true) {
      await bridge.safeReply(message, `⚠️ 修改被闸门拦下：${gated.reason}`)
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: gated.reason })
      return true
    }
    const shown = Object.entries(plan.params).slice(1).map(([key, value]) => `${key}=${value ? '开' : '关'}`).join(' ')
    await bridge.safeReply(message, `⚙ 已更新：${shown}${gated.dryRun === true ? '（干跑：没有真的发到 QQ）' : ''}`)
    bridge.trace?.event({ id: '', stage: 'ops', ok: true, reason: `成员权限已更新（${plan.action}）：${shown}` })
    return true
  }

  // —— /设管理 <@某人|QQ> · /撤管理 <@某人|QQ>（v0.5.8）——
  // 探针红线：`enable` 省略时 NapCat 按 false 处理（等于静默撤管理员），
  // 所以 planGroupAdmin 强制要求显式布尔值，这里也永远把它发给 API。
  const adminWord = /^[\/／](设管理|撤管理)(?:\s|$)/.exec(raw)
  if (adminWord) {
    // 真话口径（干跑逐条实测抓到）：设/撤不能共用「设置管理员」一个标签——
    // `/撤管理` 被拦下时回一句"设置管理员未执行"，用户会以为发错了命令。
    const adminLabel = adminWord[1] === '设管理' ? '设置管理员' : '撤销管理员'
    if (!isGroup) return needGroup()
    if (bridge.config.opsAdminEnabled !== true) {
      await bridge.safeReply(message, '👑 管理员设置未启用（opsAdminEnabled=false）')
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: 'opsAdminEnabled=false' })
      return true
    }
    if (!isAdmin) {
      await bridge.safeReply(message, `⚠️ ${adminLabel}仅管理员可用。`)
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: `${adminLabel}仅管理员可用` })
      return true
    }
    const blocked = bridge.botAdminBlockedReason(groupId)
    if (blocked !== '') {
      await bridge.safeReply(message, `⚠️ ${blocked}`)
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: blocked })
      return true
    }
    const parsed = parseOpsArgs(raw, `${raw.slice(0, 1)}${adminWord[1]}`)
    const arg = parsed.ok ? parsed.arg : ''
    const target = (message.ats ?? []).find((qq) => qq && qq !== bridge.config.botQq) ?? Number((/^\s*(\d{5,11})/.exec(arg) ?? [])[1] ?? 0)
    // 用**正则真正匹配到的那个词**决定是设还是撤。早前写的是 `raw.includes('设管理')`，
    // 于是 `/撤管理 10009 设管理员` 会被判成"设"——一次静默的反向提权
    // （独立对抗性审查抓到的 P1；参数里出现"设管理员"三个字并不代表要给权限）。
    const enable = adminWord[1] === '设管理'
    const plan = planGroupAdmin({ groupId, userId: target, enable })
    if (!plan.ok) {
      await bridge.safeReply(message, `⚠️ 修改失败：${plan.reason}\n用法：/设管理 @某人 或 /撤管理 @某人（也可以直接写 QQ 号）`)
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: plan.reason })
      return true
    }
    if (injected) {
      await bridge.safeReply(message, `👑 管理员未修改：${bridge.engageBlockedReason(adminLabel)}`)
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: bridge.engageBlockedReason(adminLabel) })
      return true
    }
    const gated = await bridge.runOpsAction(message, adminLabel, () => bridge.gate.run(plan.action, chatKey, `${plan.params.user_id}=${plan.params.enable}`, () => bridge.server.setGroupAdmin(message.bot, plan.params.group_id, plan.params.user_id, plan.params.enable)))
    if (gated === null) return true
    if (gated.ok !== true) {
      await bridge.safeReply(message, `⚠️ 修改被闸门拦下：${gated.reason}`)
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: gated.reason })
      return true
    }
    await bridge.safeReply(message, `👑 已${enable ? '设置' : '取消'} ${plan.params.user_id} 的管理员${gated.dryRun === true ? '（干跑：没有真的发到 QQ）' : ''}`)
    bridge.trace?.event({ id: '', stage: 'ops', ok: true, reason: `管理员已${enable ? '设置' : '取消'}（${plan.action} enable=${enable}）` })
    return true
  }

  // —— /邀请策略 <关闭|需审核|免审核|百人以下>（v0.5.8，探针确认的四个字面量）——
  if (/^[\/／]邀请策略(?:\s|$)/.test(raw)) {
    if (!isGroup) return needGroup()
    if (bridge.config.opsInvitePolicyEnabled !== true) {
      await bridge.safeReply(message, '✉️ 邀请策略未启用（opsInvitePolicyEnabled=false）')
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: 'opsInvitePolicyEnabled=false' })
      return true
    }
    if (!isAdmin) {
      await bridge.safeReply(message, '⚠️ 邀请策略仅管理员可用。')
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: '邀请策略仅管理员可用' })
      return true
    }
    const blocked = bridge.botAdminBlockedReason(groupId)
    if (blocked !== '') {
      await bridge.safeReply(message, `⚠️ ${blocked}`)
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: blocked })
      return true
    }
    const parsed = parseOpsArgs(raw, `${raw.slice(0, 1)}邀请策略`)
    const policy = parseInvitePolicy(parsed.ok ? parsed.arg : '')
    const plan = planInvitePolicy({ groupId, policy })
    if (!plan.ok) {
      await bridge.safeReply(message, `⚠️ 修改失败：${plan.reason}\n用法：${INVITE_POLICIES.map((item) => `/邀请策略 ${item.words[0]}`).join(' · ')}`)
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: plan.reason })
      return true
    }
    if (injected) {
      await bridge.safeReply(message, `✉️ 邀请策略未修改：${bridge.engageBlockedReason('邀请策略')}`)
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: bridge.engageBlockedReason('邀请策略') })
      return true
    }
    const gated = await bridge.runOpsAction(message, '邀请策略', () => bridge.gate.run(plan.action, chatKey, plan.params.policy, () => bridge.server.setGroupMemberInvitePolicy(message.bot, plan.params.group_id, plan.params.policy)))
    if (gated === null) return true
    if (gated.ok !== true) {
      await bridge.safeReply(message, `⚠️ 修改被闸门拦下：${gated.reason}`)
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: gated.reason })
      return true
    }
    await bridge.safeReply(message, `✉️ 邀请策略已设为「${invitePolicyLabel(plan.params.policy)}」${gated.dryRun === true ? '（干跑：没有真的发到 QQ）' : ''}`)
    bridge.trace?.event({ id: '', stage: 'ops', ok: true, reason: `邀请策略已更新为 ${plan.params.policy}` })
    return true
  }

  // —— /加群方式 <1-5> [问题=… 答案=…]（v0.5.8）——
  // add_type 是 QQ 裸数字，NapCat 没有给枚举；只有 4/5 会连问题/答案一起写。
  // 这里刻意**不翻译** 1/2/3 的语义（没查到权威定义就不猜），只把取值原样透传。
  if (/^[\/／]加群方式(?:\s|$)/.test(raw)) {
    if (!isGroup) return needGroup()
    if (bridge.config.opsAddOptionEnabled !== true) {
      await bridge.safeReply(message, '🚪 加群方式未启用（opsAddOptionEnabled=false）')
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: 'opsAddOptionEnabled=false' })
      return true
    }
    if (!isAdmin) {
      await bridge.safeReply(message, '⚠️ 加群方式仅管理员可用。')
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: '加群方式仅管理员可用' })
      return true
    }
    const blocked = bridge.botAdminBlockedReason(groupId)
    if (blocked !== '') {
      await bridge.safeReply(message, `⚠️ ${blocked}`)
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: blocked })
      return true
    }
    const parsed = parseOpsArgs(raw, `${raw.slice(0, 1)}加群方式`)
    const arg = parsed.ok ? parsed.arg : ''
    const addType = (/^\s*([1-5])(?:\s|$)/.exec(arg) ?? [])[1]
    const question = (/问题\s*[=＝:]\s*(\S+)/.exec(arg) ?? [])[1]
    const answer = (/答案\s*[=＝:]\s*(\S+)/.exec(arg) ?? [])[1]
    const plan = planAddOption({ groupId, addType, question, answer })
    if (!plan.ok) {
      await bridge.safeReply(message, `⚠️ 修改失败：${plan.reason}\n用法：/加群方式 1–5（4/5 还要给 问题=… 答案=…）`)
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: plan.reason })
      return true
    }
    if (injected) {
      await bridge.safeReply(message, `🚪 加群方式未修改：${bridge.engageBlockedReason('加群方式')}`)
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: bridge.engageBlockedReason('加群方式') })
      return true
    }
    const gated = await bridge.runOpsAction(message, '加群方式', () => bridge.gate.run(plan.action, chatKey, `add_type=${plan.params.add_type}`, () => bridge.server.setGroupAddOption(message.bot, plan.params.group_id, plan.params.add_type, { question: plan.params.group_question, answer: plan.params.group_answer })))
    if (gated === null) return true
    if (gated.ok !== true) {
      await bridge.safeReply(message, `⚠️ 修改被闸门拦下：${gated.reason}`)
      bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: gated.reason })
      return true
    }
    const extra = plan.params.group_question === undefined ? '' : `（问题：${plan.params.group_question}）`
    // 方式 5 只写问题、不保存答案（探针确认），所以给了答案要说一声"忽略了"，
    // 不能让管理员以为答案生效了。
    const ignoredAnswer = plan.params.add_type === 5 && String(answer ?? '').trim() !== '' ? '（方式 5 不保存答案，已忽略你给的答案）' : ''
    await bridge.safeReply(message, `🚪 加群方式已设为 ${plan.params.add_type}${extra}${ignoredAnswer}${gated.dryRun === true ? '（干跑：没有真的发到 QQ）' : ''}`)
    bridge.trace?.event({ id: '', stage: 'ops', ok: true, reason: `加群方式已更新为 ${plan.params.add_type}` })
    return true
  }

  if (await handleOpsRequestSync({ message, raw, bridge, isAdmin, injected })) return true

  return false
}
