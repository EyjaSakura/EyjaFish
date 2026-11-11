import test from 'node:test'
import assert from 'node:assert/strict'
import { handleGroupRead } from '../lib/services/group-read.js'

function harness(overrides = {}) {
  const replies = []
  const deps = {
    message: { messageType: 'group', groupId: 9 },
    text: '/荣誉',
    server: {
      currentSocket: () => 'sock',
      getGroupHonorInfo: async () => ({ current_talkative: { nickname: 'A' } }),
      getGroupNotice: async () => ({ notices: [{ message: { text: '公告一' }, sender_id: 1 }] }),
      getEssenceMsgList: async () => [{ content: '精华一', message_id: 1 }],
    },
    safeReply: async (_m, t) => replies.push(t),
    ...overrides,
  }
  return { deps, replies }
}

test('非群聊 / 无连接返回 false', async () => {
  assert.equal(await handleGroupRead(harness({ message: { messageType: 'private' } }).deps), false)
  assert.equal(await handleGroupRead(harness({ server: { currentSocket: () => null } }).deps), false)
})

test('群荣誉成功 / 失败', async () => {
  const ok = harness()
  assert.equal(await handleGroupRead(ok.deps), true)
  assert.equal(ok.replies.length, 1)

  const bad = harness({ server: { currentSocket: () => 's', getGroupHonorInfo: async () => { throw new Error('net') } } })
  assert.equal(await handleGroupRead(bad.deps), true)
  assert.match(bad.replies[0], /查询失败/)
})

test('群公告：有列表 / 空 / 失败', async () => {
  const list = harness({ text: '/公告' })
  assert.equal(await handleGroupRead(list.deps), true)
  assert.match(list.replies[0], /公告一/)

  const empty = harness({ text: '/公告', server: { currentSocket: () => 's', getGroupNotice: async () => [] } })
  assert.equal(await handleGroupRead(empty.deps), true)
  assert.match(empty.replies[0], /还没有公告/)

  const bad = harness({ text: '/公告', server: { currentSocket: () => 's', getGroupNotice: async () => { throw new Error('x') } } })
  assert.match((await handleGroupRead(bad.deps), bad.replies[0]), /读取公告失败/)
})

test('群精华：有列表 / 空 / 失败', async () => {
  const list = harness({ text: '/群精华' })
  assert.equal(await handleGroupRead(list.deps), true)
  assert.match(list.replies[0], /精华一/)

  const empty = harness({ text: '/群精华', server: { currentSocket: () => 's', getEssenceMsgList: async () => [] } })
  assert.match((await handleGroupRead(empty.deps), empty.replies[0]), /还没有精华/)

  const bad = harness({ text: '/群精华', server: { currentSocket: () => 's', getEssenceMsgList: async () => { throw new Error('x') } } })
  assert.match((await handleGroupRead(bad.deps), bad.replies[0]), /读取精华失败/)
})

test('未知命令返回 false', async () => {
  assert.equal(await handleGroupRead(harness({ text: '/别的' }).deps), false)
})
