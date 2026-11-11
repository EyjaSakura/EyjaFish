import test from 'node:test'
import assert from 'node:assert/strict'
import { handlePoke } from '../lib/services/poke-command.js'

function harness(overrides = {}) {
  const calls = []
  const lastPokeAt = new Map()
  const deps = {
    notice: { userId: 5, groupId: 9, bot: 'b' },
    config: {},
    lastPokeAt,
    now: 1000,
    checkPoke: () => ({ ok: true, isGroup: true, key: 'g:9' }),
    planPoke: () => ({ ok: true, action: 'group_poke', params: { group_id: '9', user_id: '5' } }),
    pickPokeText: () => '戳回去啦',
    engageOn: () => true,
    engageWriteBlocked: () => false,
    engageBlockedReason: () => '注入回合',
    pokeQuota: {
      check: () => (overrides.quotaBlocked ? { ok: false, reason: '上限' } : { ok: true }),
      record: () => calls.push('quota-record'),
    },
    gate: {
      run: async (a, k, d, fn) => {
        calls.push(['gate', a])
        if (overrides.gateThrow) throw new Error('boom')
        if (overrides.gateBlocked) return { ok: false, reason: '拒绝' }
        await fn()
        return { ok: true }
      },
    },
    server: {
      groupPoke: async (...a) => calls.push(['group-poke', ...a]),
      friendPoke: async (...a) => calls.push(['friend-poke', ...a]),
      sendSegments: async (...a) => calls.push(['send', ...a]),
    },
    saveEngageState: () => calls.push('save'),
    debugLog: () => {},
    ...overrides,
  }
  return { deps, calls, lastPokeAt }
}

test('检查失败直接返回', async () => {
  const { deps, calls } = harness({ checkPoke: () => ({ ok: false, reason: '不在白名单' }) })
  const r = await handlePoke(deps)
  assert.equal(r.ok, false)
  assert.equal(calls.length, 0)
})

test('回戳成功：记录冷却/配额/保存并补话', async () => {
  const { deps, calls, lastPokeAt } = harness()
  const r = await handlePoke(deps)
  assert.equal(r.ok, true)
  assert.equal(lastPokeAt.get('g:9'), 1000)
  assert.equal(calls.some((c) => c[0] === 'group-poke'), true)
  assert.equal(calls.includes('quota-record'), true)
  assert.equal(calls.includes('save'), true)
  assert.equal(calls.some((c) => c[0] === 'send'), true)
})

test('注入拦截 / 计划失败 / 配额', async () => {
  const blocked = harness({ engageWriteBlocked: () => true })
  assert.equal((await handlePoke(blocked.deps)).ok, false)

  const plan = harness({ planPoke: () => ({ ok: false, reason: '缺目标' }) })
  assert.match((await handlePoke(plan.deps)).reason, /缺目标/)

  const quota = harness({ quotaBlocked: true })
  assert.match((await handlePoke(quota.deps)).reason, /上限/)
})

test('闸门拒绝 / 异常', async () => {
  const denied = harness({ gateBlocked: true })
  assert.match((await handlePoke(denied.deps)).reason, /闸门拦下/)

  const thrown = harness({ gateThrow: true })
  assert.match((await handlePoke(thrown.deps)).reason, /回戳失败/)
})

test('私聊回戳 + 无文案时静默', async () => {
  const { deps, calls } = harness({
    notice: { userId: 5, groupId: 0, bot: 'b' },
    checkPoke: () => ({ ok: true, isGroup: false, key: 'u:5' }),
    planPoke: () => ({ ok: true, action: 'friend_poke', params: { user_id: '5' } }),
    pickPokeText: () => '',
  })
  const r = await handlePoke(deps)
  assert.equal(r.ok, true)
  assert.equal(calls.some((c) => c[0] === 'friend-poke'), true)
  assert.equal(calls.some((c) => c[0] === 'send'), false)
})
