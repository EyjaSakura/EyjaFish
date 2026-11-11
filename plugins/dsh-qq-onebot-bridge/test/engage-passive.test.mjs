import test from 'node:test'
import assert from 'node:assert/strict'
import { engagePassive } from '../lib/services/engage-passive.js'

function harness(overrides = {}) {
  const marks = []
  const calls = []
  const bridge = {
    config: { emojiLikeMentionOnly: true, emojiLikeId: '128077' },
    engageOn: (n) => overrides.enabled?.[n] !== false,
    engageWriteBlocked: () => overrides.blocked === true,
    engageBlockedReason: () => '注入回合',
    markReadQuota: {
      check: () => (overrides.readQuota ? { ok: false, reason: '上限' } : { ok: true }),
      record: () => calls.push('read-record'),
    },
    emojiLikeQuota: {
      check: () => (overrides.likeQuota ? { ok: false, reason: '上限' } : { ok: true }),
      record: () => calls.push('like-record'),
    },
    gate: {
      run: async (action, key, desc, fn) => {
        calls.push(['gate', action])
        await fn()
        return overrides.gateBlocked ? { ok: false, reason: '拒绝' } : { ok: true }
      },
    },
    server: {
      markGroupMsgAsRead: async () => calls.push('mark-group'),
      markPrivateMsgAsRead: async () => calls.push('mark-private'),
      setMsgEmojiLike: async () => calls.push('emoji'),
    },
    saveEngageState: () => calls.push('save'),
    mark: (stage, ok, reason) => marks.push({ ok, reason }),
  }
  return { bridge, marks, calls }
}

const group = { messageType: 'group', groupId: 900000, userId: 1, messageId: 'm1', bot: 'b' }

test('全部关闭：不执行', async () => {
  const { bridge, marks } = harness({ enabled: { markReadEnabled: false, emojiLikeEnabled: false } })
  await engagePassive({ message: group, ...bridge })
  assert.equal(marks.length, 0)
})

test('标记已读成功（群）', async () => {
  const { bridge, calls } = harness()
  await engagePassive({ message: group, ...bridge })
  assert.ok(calls.includes('mark-group'))
  assert.ok(calls.includes('read-record'))
})

test('注入拦截：不调 API', async () => {
  const { bridge, calls, marks } = harness({ blocked: true })
  await engagePassive({ message: group, ...bridge })
  assert.equal(calls.some((c) => c === 'mark-group'), false)
  assert.ok(marks.some((m) => String(m.reason).includes('注入回合')))
})

test('配额拦截', async () => {
  const { bridge, calls, marks } = harness({ readQuota: true })
  await engagePassive({ message: group, ...bridge })
  assert.equal(calls.some((c) => c === 'mark-group'), false)
  assert.ok(marks.some((m) => String(m.reason).includes('上限')))
})

test('贴表情：未 @ 且 mentionOnly 时跳过', async () => {
  const { bridge, marks } = harness({ enabled: { markReadEnabled: false } })
  await engagePassive({ message: group, ...bridge })
  assert.ok(marks.some((m) => String(m.reason).includes('贴表情跳过')))
})

test('贴表情成功（被 @）', async () => {
  const { bridge, calls } = harness({ enabled: { markReadEnabled: false } })
  await engagePassive({ message: { ...group, atMe: true }, ...bridge })
  assert.ok(calls.includes('emoji'))
  assert.ok(calls.includes('like-record'))
  assert.ok(calls.includes('save'))
})

test('贴表情：闸门拒绝', async () => {
  const { bridge, calls, marks } = harness({ enabled: { markReadEnabled: false }, gateBlocked: true })
  await engagePassive({ message: { ...group, atMe: true }, ...bridge })
  assert.equal(calls.includes('like-record'), false)
  assert.ok(marks.some((m) => String(m.reason).includes('闸门拦下')))
})


test('私聊标记已读', async () => {
  const { bridge, calls } = harness({ enabled: { emojiLikeEnabled: false } })
  await engagePassive({ message: { messageType: 'private', userId: 1, messageId: 'm', bot: 'b' }, ...bridge })
  assert.ok(calls.includes('mark-private'))
})

test('贴表情：缺 message_id 只记失败', async () => {
  const { bridge, marks } = harness({ enabled: { markReadEnabled: false } })
  await engagePassive({ message: { ...group, messageId: '', atMe: true }, ...bridge })
  assert.ok(marks.some((m) => String(m.reason).includes('贴表情需要消息 ID')))
})
