// 被动互动：标记已读 + 贴表情。所有副作用通过依赖注入，便于单测。
import { planEmojiLike, planMarkRead } from '../engage.js'

/** @param {any} args */
export async function engagePassive({
  message,
  mark,
  config = {},
  engageOn,
  engageWriteBlocked,
  engageBlockedReason,
  markReadQuota,
  emojiLikeQuota,
  gate,
  server,
  saveEngageState,
  now = Date.now(),
}) {
  const isGroup = message.messageType === 'group'
  const chatKey = isGroup ? `g:${message.groupId}` : `u:${message.userId}`
  const injected = engageWriteBlocked(message)

  if (engageOn('markReadEnabled')) {
    const plan = planMarkRead({ groupId: isGroup ? message.groupId : undefined, userId: isGroup ? undefined : message.userId })
    if (!plan.ok) {
      mark('engage', false, `标记已读未执行：${plan.reason}`, null, 'debug')
    } else if (injected) {
      mark('engage', false, engageBlockedReason('标记已读'), null, 'debug')
    } else {
      const quota = markReadQuota.check(`read:${chatKey}`, now, '标记已读')
      if (!quota.ok) {
        mark('engage', false, `标记已读未执行：${quota.reason}`, null, 'debug')
      } else {
        try {
          const gated = await gate.run(plan.action, chatKey, 'auto', () => (plan.action === 'mark_group_msg_as_read'
            ? server.markGroupMsgAsRead(message.bot, plan.params.group_id)
            : server.markPrivateMsgAsRead(message.bot, plan.params.user_id)))
          if (gated.ok === true) {
            markReadQuota.record(`read:${chatKey}`)
            mark('engage', true, `已标记已读（${plan.action}）`, null, 'debug')
          } else {
            mark('engage', false, `标记已读被闸门拦下：${gated.reason}`, null, 'debug')
          }
        } catch (error) {
          mark('engage', false, `标记已读失败：${error.message}`, null, 'debug')
        }
      }
    }
  }

  if (engageOn('emojiLikeEnabled')) {
    const mentionOnly = config.emojiLikeMentionOnly !== false
    const mentioned = message.atMe === true || (message.reply && String(message.reply.messageId ?? '') !== '')
    if (mentionOnly && !mentioned) {
      mark('engage', false, '贴表情跳过：emojiLikeMentionOnly=true 且这条不是在叫我/引用我', null, 'debug')
    } else {
      const plan = planEmojiLike({ messageId: message.messageId, emojiId: config.emojiLikeId })
      if (!plan.ok) {
        mark('engage', false, `贴表情未执行：${plan.reason}`, null, 'debug')
      } else if (injected) {
        mark('engage', false, `${engageBlockedReason('贴表情')}（set_msg_emoji_like 只带 message_id，scoped dry-run 拦不住）`, null, 'debug')
      } else {
        const quota = emojiLikeQuota.check(`like:${chatKey}`, now, '贴表情')
        if (!quota.ok) {
          mark('engage', false, `贴表情未执行：${quota.reason}`, null, 'debug')
        } else {
          try {
            const gated = await gate.run('set_msg_emoji_like', chatKey, `msg=${plan.params.message_id}`, () => server.setMsgEmojiLike(message.bot, plan.params.message_id, plan.params.emoji_id))
            if (gated.ok === true) {
              emojiLikeQuota.record(`like:${chatKey}`)
              saveEngageState()
              mark('engage', true, `已贴表情 ${plan.params.emoji_id}（消息 ${plan.params.message_id}）`, null, 'debug')
            } else {
              mark('engage', false, `贴表情被闸门拦下：${gated.reason}`, null, 'debug')
            }
          } catch (error) {
            mark('engage', false, `贴表情失败：${error.message}`, null, 'debug')
          }
        }
      }
    }
  }
}
