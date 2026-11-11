import test from 'node:test'
import assert from 'node:assert/strict'
import { learnBotNames } from '../lib/services/bot-names.js'

function harness(overrides = {}) {
  return {
    server: {
      currentSocket: () => 'sock',
      getLoginInfo: async () => ({ nickname: '小鲸鱼' }),
      getGroupMemberInfo: async (_s, gid) => ({ card: gid === 9 ? '鲸鱼' : '' }),
    },
    config: { allowGroups: [9], botQq: 10001 },
    debugLog: () => {},
    ...overrides,
  }
}

test('无连接返回 null', async () => {
  const r = await learnBotNames(harness({ server: { currentSocket: () => null } }))
  assert.equal(r, null)
})

test('学到昵称与群名片', async () => {
  const r = await learnBotNames(harness())
  assert.deepEqual(r.names.sort(), ['小鲸鱼', '鲸鱼'].sort())
  assert.equal(r.failed, false)
})

test('登录失败仍能学群名片', async () => {
  const logs = []
  const r = await learnBotNames(harness({
    server: {
      currentSocket: () => 's',
      getLoginInfo: async () => { throw new Error('login') },
      getGroupMemberInfo: async () => ({ card: '卡片' }),
    },
    debugLog: (m) => logs.push(m),
  }))
  assert.deepEqual(r.names, ['卡片'])
  assert.equal(logs.some((m) => m.includes('nickname failed')), true)
})

test('全失败时 failed=true', async () => {
  const r = await learnBotNames(harness({
    server: {
      currentSocket: () => 's',
      getLoginInfo: async () => ({}),
      getGroupMemberInfo: async () => { throw new Error('card') },
    },
  }))
  assert.deepEqual(r.names, [])
  assert.equal(r.failed, true)
})
