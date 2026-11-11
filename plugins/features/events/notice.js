// 自动抽取自 bridge.js #onNotice
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, unlinkSync, statSync } from 'node:fs'
import { join, basename, dirname, extname } from 'node:path'
import { formatInputStatusNotice, isEmojiLikeNotice, isInputStatusNotice, isRecallNotice } from '@zfqxuz/dsh-qq-onebot-bridge/lib/sdk/index.js'

export async function onNotice({ notice, bridge, defineTool, debugLog }) {
  if (bridge.stopped) return
  if (bridge.config.recordInbound !== false && notice.__injected !== true && notice.__replayed !== true) bridge.inbox.record('notice', notice)
  const trace = bridge.beginEventTrace('notice', notice)
  const mark = (stage, ok = true, reason = '', data = null, level = 'info') => trace?.mark(stage, { ok, reason, data, level })
  try {
    if (notice.noticeType === 'notify' && notice.subType === 'poke' && bridge.config.pokeEnabled) {
      const poke = await bridge.handlePoke(notice)
      mark('notice', poke?.ok === true, poke?.ok === true ? '戳一戳已回复' : `戳一戳未回复：${poke?.reason ?? '未知原因'}`, null, poke?.ok === true ? 'info' : 'debug')
      return
    }
    if (isEmojiLikeNotice(notice) && bridge.engageOn('reactionStatsEnabled')) {
      const recorded = bridge.reactions.apply(notice)
      if (recorded.ok) {
        bridge.saveEngageState()
        // 让控制台的运行快照跟着变（节流 2s，代价可忽略）：否则面板上的表情计数会一直停在启动时的 0。
        bridge.writeRuntimeSnapshot()
        const delta = `${recorded.added > 0 ? `+${recorded.added}` : ''}${recorded.removed > 0 ? `-${recorded.removed}` : ''}` || '±0'
        mark('notice', true, `表情回应已记账：消息 ${recorded.messageId} 表情 ${recorded.emojiId} ${delta}，该消息合计 ${recorded.total}`,
          { messageId: recorded.messageId, emojiId: recorded.emojiId, total: recorded.total })
      } else {
        mark('notice', false, `表情回应未记账：${recorded.reason}`, null, 'debug')
      }
      return
    }
    if (isInputStatusNotice(notice)) {
      // 对方（好友/群友）在打字：只留痕，不回话——机器人不该对"正在输入"做任何动作。
      mark('notice', true, `对方输入状态：${formatInputStatusNotice(notice)}`, null, 'debug')
      return
    }
    if (notice.noticeType === 'group_increase' && bridge.config.welcomeEnabled) {
      await bridge.handleWelcome(notice)
      mark('notice', true, '入群欢迎已发送')
      return
    }
    // —— group_admin：管理员身份变更（v0.5.8 权限自愈）——
    // 真机探针：sub_type 是 'set' / 'unset' 字符串，事件里**没有** set 布尔字段，
    // 也没有 operator_id（被变更的人就是 user_id 本人）。
    if (notice.noticeType === 'group_admin') {
      const selfQq = Number(bridge.config.botQq ?? 0)
      const isSelf = Number(notice.userId) === selfQq || (notice.selfId !== undefined && Number(notice.userId) === Number(notice.selfId))
      if (isSelf && Number(notice.groupId) > 0) {
        // 判据优先用 sub_type（'set'/'unset'，真机探针确认的唯一权威字段）。
        // 注入器与回放管线送进来的 notice **不带** `adminSet`（只有 parseNotice 会补），
        // 早前写 `notice.adminSet !== false` ⇒ undefined 被当成 true：一条 'unset' 的
        // 注入/回放事件会被记成"已恢复管理员"并推播，方向正好反了（审查 P2）。
        const sub = String(notice.subType ?? '').toLowerCase()
        const enable = sub === 'set' ? true : sub === 'unset' ? false : notice.adminSet
        if (enable === undefined) {
          mark('notice', false, `group_admin 事件缺少可判定的 sub_type（subType=${sub === '' ? '空' : sub}），本轮不记账`, null, 'warn')
          return
        }
        bridge.botAdminKnown.set(Number(notice.groupId), enable)
        bridge.botAdminKnownAt.set(Number(notice.groupId), Date.now())
        bridge.countOps('adminChange')
        if (bridge.config.adminWatchEnabled === true) {
          // 与欢迎语/戳一戳/防撤回同一口径：白名单外的群一个字都不发。
          if (!bridge.config.allowGroups.includes(Number(notice.groupId))) {
            mark('notice', true, `机器人管理员身份变更：群 ${notice.groupId} 不在 allowGroups 白名单，不播报`, null, 'info')
            return
          }
          await bridge.deliverExternal(
            `g:${notice.groupId}`,
            enable
              ? '👑 我已恢复群管理员，禁言/踢人/公告这类写操作可以正常用了。'
              : '⚠️ 我已不是本群管理员，禁言/踢人/公告/群设置这类写操作会失败——需要的话请重新给我管理员。',
            'adminWatch',
          )
        }
        mark('notice', true, `机器人管理员身份变更：群 ${notice.groupId} → ${enable ? '已设置' : '已取消'}`)
      } else {
        mark('notice', true, `群 ${notice.groupId} 成员 ${notice.userId} 的管理员身份变更（与我无关）`, null, 'debug')
      }
      return
    }
    // 周报计数：入群/退群/禁言都记一笔（与欢迎语开关无关，运营数字要完整）。
    if (notice.noticeType === 'group_increase' && notice.userId !== notice.selfId) bridge.countOps('join')
    if (notice.noticeType === 'group_decrease' && notice.userId !== notice.selfId) bridge.countOps('leave')
    if (notice.noticeType === 'group_ban') bridge.countOps(Number(notice.duration) > 0 ? 'mute' : 'unmute')
    if (isRecallNotice(notice) && bridge.config.antiRecallEnabled) {
      await bridge.handleRecallNotice(notice)
      mark('notice', true, '防撤回已处理')
      return
    }
    // 生命周期通知（v0.5.9 真机抓到）：NapCat 在机器人掉线/上线时发 `bot_offline`/`bot_online`。
    // 以前落到"未处理的 notice"，于是"机器人掉线了"这件事只有翻 trace 才知道——用户看到的现象
    // 是"发了消息没人理"，而控制台上什么提示都没有。现在写明状态 + 记进快照 + 走推送（开了才发）。
    if (typeof notice.noticeType === 'string' && notice.noticeType.startsWith('bot_')) {
      const online = notice.noticeType === 'bot_online'
      const why = online ? '机器人已上线' : '机器人已离线（QQ 掉线或账号在别处登录，例如同一客户端又开了一个实例抢了会话）'
      bridge.botOnline = online
      bridge.botOnlineAt = Date.now()
      mark('notice', online, `${why}：${notice.noticeType}/${notice.subType || '—'}`, null, online ? 'info' : 'warn')
      bridge.writeRuntimeSnapshot(true)
      bridge.notify(online ? '✅ QQ 机器人已上线' : '⚠️ QQ 机器人已离线（检查 NapCat / 是否在别处登录了同一账号）')
      return
    }
    mark('notice', false, `未处理的 notice：${notice.noticeType}/${notice.subType}`
      + (notice.noticeType === 'notify' && notice.subType === 'poke' && !bridge.config.pokeEnabled ? '（pokeEnabled=false）' : '')
      + (notice.noticeType === 'group_increase' && !bridge.config.welcomeEnabled ? '（welcomeEnabled=false）' : '')
      + (isRecallNotice(notice) && !bridge.config.antiRecallEnabled ? '（antiRecallEnabled=false）' : '')
      + (isEmojiLikeNotice(notice) && !bridge.engageOn('reactionStatsEnabled') ? `（engageEnabled=${bridge.config.engageEnabled === true}，reactionStatsEnabled=${bridge.config.reactionStatsEnabled === true}）` : ''))
  } catch (error) {
    debugLog(`notice handling failed: ${error.message}`)
    mark('notice', false, `notice 处理失败：${error.message}`, null, 'error')
  }
}
