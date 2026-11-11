import test from 'node:test'
import assert from 'node:assert/strict'
import {
  emojiGlyph, isValidUserId, planPoke, planEmojiLike, planMarkRead, planSendLike,
  planInputStatus, describeInputStatus, isInputStatusNotice, isEmojiLikeNotice,
  formatInputStatusNotice, formatReactionBoard, formatEmojiLikes,
  parseEmojiLikesResult, parseEngageArgs,
} from '../lib/engage.js'

test('emojiGlyph / isValidUserId', () => {
  assert.equal(emojiGlyph('128077'), '👍')
  assert.equal(emojiGlyph('abc'), 'abc')
  assert.equal(emojiGlyph('0'), '#0')
  assert.equal(emojiGlyph(''), '?')
  assert.equal(isValidUserId('123'), true)
  assert.equal(isValidUserId(123), true)
  assert.equal(isValidUserId('0'), false)
  assert.equal(isValidUserId('abc'), false)
  assert.equal(isValidUserId(''), false)
})

test('planPoke', () => {
  assert.equal(planPoke({ targetId: '' }).ok, false)
  assert.deepEqual(planPoke({ groupId: 9, targetId: 5 }), { ok: true, action: 'group_poke', params: { group_id: '9', user_id: '5' }, reason: '' })
  assert.deepEqual(planPoke({ targetId: 5 }), { ok: true, action: 'friend_poke', params: { user_id: '5' }, reason: '' })
  assert.equal(planPoke({ groupId: 'bad', targetId: 5 }).ok, false)
})

test('planEmojiLike / planMarkRead', () => {
  assert.equal(planEmojiLike({ messageId: '' }).ok, false)
  assert.equal(planEmojiLike({ messageId: 1, emojiId: 'x' }).ok, false)
  assert.deepEqual(planEmojiLike({ messageId: 1 }), { ok: true, action: 'set_msg_emoji_like', params: { message_id: '1', emoji_id: '128077', set: true }, reason: '' })
  assert.equal(planEmojiLike({ messageId: 1, set: false }).params.set, false)

  assert.equal(planMarkRead({}).ok, false)
  assert.equal(planMarkRead({ groupId: 9 }).action, 'mark_group_msg_as_read')
  assert.equal(planMarkRead({ userId: 5 }).action, 'mark_private_msg_as_read')
})

test('planSendLike 夹紧', () => {
  assert.equal(planSendLike({ userId: '' }).ok, false)
  const r = planSendLike({ userId: 5, times: 99 })
  assert.equal(r.params.times, 10)
  assert.equal(r.clamped, true)
  assert.equal(planSendLike({ userId: 5, times: 'abc' }).params.times, 1)
})

test('planInputStatus / describe / notice 判断', () => {
  assert.equal(planInputStatus({ isGroup: true, userId: 5 }).ok, false)
  assert.equal(planInputStatus({ userId: '' }).ok, false)
  assert.equal(planInputStatus({ userId: 5 }).params.event_type, 1)
  assert.equal(planInputStatus({ userId: 5, eventType: 2 }).params.event_type, 2)
  assert.equal(describeInputStatus(1), '正在输入')
  assert.equal(describeInputStatus(2), '停止输入')
  assert.match(describeInputStatus(9), /未知/)
  assert.equal(isInputStatusNotice({ noticeType: 'notify', subType: 'input_status' }), true)
  assert.equal(isEmojiLikeNotice({ noticeType: 'group_msg_emoji_like' }), true)
})

test('formatInputStatusNotice 不重复标点', () => {
  assert.equal(formatInputStatusNotice({ userId: 5, statusText: '对方正在输入...' }), '5 对方正在输入...')
  assert.equal(formatInputStatusNotice({ userId: 5, statusText: '打字中' }), '5 打字中…')
})

test('formatReactionBoard / formatEmojiLikes', () => {
  assert.match(formatReactionBoard([]), /还没有任何/)
  const text = formatReactionBoard([
    { messageId: '1', total: 3, emojis: [{ glyph: '👍', count: 2 }], chatKey: 'g:9' },
  ], { textOf: () => '你好' })
  assert.match(text, /你好/)
  assert.match(text, /本群/)
  assert.equal(formatEmojiLikes([], { messageId: '1' }), '消息 1 没有表情回应记录（来源：本地统计）')
  assert.match(formatEmojiLikes([{ glyph: '👍', count: 2, users: [{ userId: 1, name: 'A' }] }], { messageId: '1' }), /A\(1\)/)
})

test('parseEmojiLikesResult', () => {
  const r = parseEmojiLikesResult({ emoji_like_list: [{ user_id: 1, nick_name: 'A' }, { tinyId: 2 }] }, { emojiId: '128077' })
  assert.equal(r.count, 2)
  assert.deepEqual(r.users[0], { userId: '1', name: 'A' })
  assert.equal(r.glyph, '👍')
})

test('parseEngageArgs', () => {
  assert.equal(parseEngageArgs('/戳 1', '').ok, false)
  assert.equal(parseEngageArgs('/点赞 1', '/戳').ok, false)
  assert.equal(parseEngageArgs('/戳1', '/戳').ok, false)
  assert.equal(parseEngageArgs('/戳', '/戳').ok, false)
  assert.deepEqual(parseEngageArgs('/戳 123', '/戳'), { ok: true, arg: '123', reason: '' })
})
