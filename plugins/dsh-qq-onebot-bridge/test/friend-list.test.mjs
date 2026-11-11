import test from 'node:test'
import assert from 'node:assert/strict'
import { handleFriendList } from '../lib/services/friend-list.js'

function harness(overrides = {}) {
  const replies = []
  const deps = {
    message: { messageType: 'private' },
    text: '/好友',
    config: { friendListEnabled: true },
    canRun: () => ({ allowed: true }),
    server: {
      currentSocket: () => 'sock',
      getFriendList: async () => [{ user_id: 1, remark: 'A' }, { user_id: 2, nickname: 'B' }],
    },
    safeReply: async (_m, t) => replies.push(t),
    ...overrides,
  }
  return { deps, replies }
}

test('关闭 / 非私聊 / 无权限 / 非命令返回 false', async () => {
  assert.equal(await handleFriendList(harness({ config: {} }).deps), false)
  assert.equal(await handleFriendList(harness({ message: { messageType: 'group' } }).deps), false)
  assert.equal(await handleFriendList(harness({ canRun: () => ({ allowed: false }) }).deps), false)
  assert.equal(await handleFriendList(harness({ text: '你好' }).deps), false)
})

test('注入 / 无连接', async () => {
  const injected = harness({ message: { messageType: 'private', __injected: true } })
  assert.equal(await handleFriendList(injected.deps), true)
  assert.match(injected.replies[0], /回放\/注入/)

  const off = harness({ server: { currentSocket: () => null } })
  assert.equal(await handleFriendList(off.deps), true)
  assert.match(off.replies[0], /无可用连接/)
})

test('空列表 / 正常列表 / 超过 20', async () => {
  const empty = harness({ server: { currentSocket: () => 's', getFriendList: async () => [] } })
  await handleFriendList(empty.deps)
  assert.match(empty.replies[0], /空的/)

  const normal = harness()
  await handleFriendList(normal.deps)
  assert.match(normal.replies[0], /好友 2 人/)
  assert.match(normal.replies[0], /A（1）/)

  const many = harness({ server: { currentSocket: () => 's', getFriendList: async () => Array.from({ length: 25 }, (_, i) => ({ user_id: i })) } })
  await handleFriendList(many.deps)
  assert.match(many.replies[0], /显示前 20/)
})

test('查询异常', async () => {
  const { deps, replies } = harness({ server: { currentSocket: () => 's', getFriendList: async () => { throw new Error('x') } } })
  assert.equal(await handleFriendList(deps), true)
  assert.match(replies[0], /查询好友失败/)
})
