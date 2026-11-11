import test from 'node:test'
import assert from 'node:assert/strict'
import { handleRecallNotice } from '../lib/services/anti-recall.js'

function harness(overrides = {}) {
  const calls = []
  const lastAt = new Map()
  const deps = {
    notice: { groupId: 9, userId: 1, messageId: 'm1', bot: 'b' },
    config: { allowGroups: [9], allowUsers: [1], botQq: 10001, botName: '小鲸鱼', adminUsers: [7], antiRecallCooldownSeconds: 5 },
    recallCache: { recall: () => ({ userId: 1, text: 'hello' }) },
    recallLastAt: lastAt,
    gate: {
      run: async (action, key, desc, fn) => {
        calls.push(['gate', action])
        if (overrides.gateBlocked) return { ok: false, reason: '拒绝' }
        await fn()
        return { ok: true }
      },
    },
    server: {
      sendSegments: async (...args) => {
        calls.push(['send', ...args])
        if (overrides.imageFail && args[2] && Array.isArray(args[3]) && args[3][0]?.type === 'image') throw new Error('img')
      },
    },
    formatRecallNotice: () => ({ text: '撤回内容', images: ['http://img/1.png'] }),
    debugLog: () => {},
    now: 10_000,
    ...overrides,
  }
  return { deps, calls, lastAt }
}

test('白名单过滤：群不在 / 用户不在 / 私聊不在', async () => {
  const a = harness({ notice: { groupId: 8, userId: 1, messageId: 'm', bot: 'b' } })
  await handleRecallNotice(a.deps)
  assert.equal(a.calls.length, 0)

  const b = harness({ notice: { groupId: 9, userId: 2, messageId: 'm', bot: 'b' } })
  await handleRecallNotice(b.deps)
  assert.equal(b.calls.length, 0)

  const c = harness({ notice: { groupId: 0, userId: 2, messageId: 'm', bot: 'b' } })
  await handleRecallNotice(c.deps)
  assert.equal(c.calls.length, 0)
})

test('缓存缺失 / 机器人自己撤回', async () => {
  const miss = harness({ recallCache: { recall: () => null } })
  await handleRecallNotice(miss.deps)
  assert.equal(miss.calls.length, 0)

  const self = harness({ notice: { groupId: 9, userId: 1, messageId: 'm', bot: 'b', operatorId: 10001 } })
  await handleRecallNotice(self.deps)
  assert.equal(self.calls.length, 0)
})

test('冷却期内不重复发', async () => {
  const { deps, calls, lastAt } = harness()
  lastAt.set('g:9', 9000)
  await handleRecallNotice(deps)
  assert.equal(calls.length, 0)
})

test('群内成功：文字 + 图片', async () => {
  const { deps, calls } = harness()
  await handleRecallNotice(deps)
  const sends = calls.filter((c) => c[0] === 'send')
  assert.equal(sends.length, 2)
  assert.equal(sends[0][4][0].type, 'text')
  assert.equal(sends[1][4][0].type, 'image')
})

test('私聊补发到管理员 / 无管理员', async () => {
  const priv = harness({ config: { allowGroups: [9], allowUsers: [1], botQq: 10001, adminUsers: [7], antiRecallInGroup: false } })
  await handleRecallNotice(priv.deps)
  const send = priv.calls.find((c) => c[0] === 'send')
  assert.equal(send[2], 'private')
  assert.equal(send[3], 7)

  const noAdmin = harness({ config: { allowGroups: [9], allowUsers: [1], botQq: 10001, adminUsers: [], antiRecallInGroup: false } })
  await handleRecallNotice(noAdmin.deps)
  assert.equal(noAdmin.calls.length, 0)
})

test('闸门拒绝 / 图片失败不影响文字', async () => {
  const denied = harness({ gateBlocked: true })
  await handleRecallNotice(denied.deps)
  assert.equal(denied.calls.some((c) => c[0] === 'send'), false)

  const fail = harness({ imageFail: true })
  await handleRecallNotice(fail.deps)
  assert.equal(fail.calls.filter((c) => c[0] === 'send').length, 2)
})
