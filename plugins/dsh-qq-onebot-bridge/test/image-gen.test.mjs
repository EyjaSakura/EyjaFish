import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { handleImageGen } from '../lib/services/image-gen.js'

function harness(overrides = {}) {
  const replies = []
  const sends = []
  const deps = {
    message: { messageType: 'group', groupId: 9, userId: 1, bot: 'b' },
    prompt: '一只蓝鲸',
    config: { imageGenCommand: '/画', imageGenCooldownSeconds: 60, imageGenDailyLimit: 20, imageGenMaxPromptChars: 400 },
    chatLimits: () => ({}),
    genLastAt: new Map(),
    genDaily: new Map(),
    generateImage: async () => ({ buffer: Buffer.from('png') }),
    imageDir: mkdtempSync(join(tmpdir(), 'gen-')),
    sendImageBuffer: async (route, buffer) => sends.push({ route, buffer }),
    safeReply: async (_m, t) => replies.push(t),
    debugLog: () => {},
    now: 1_000_000,
    ...overrides,
  }
  return { deps, replies, sends }
}

test('无提示词给用法', async () => {
  const { deps, replies } = harness({ prompt: '' })
  await handleImageGen(deps)
  assert.match(replies[0], /用法/)
})

test('冷却 / 日限', async () => {
  const cool = harness({ now: 2000 })
  cool.deps.genLastAt.set('g:9', 1000)
  await handleImageGen(cool.deps)
  assert.match(cool.replies[0], /画得太快/)

  const daily = harness()
  daily.deps.genDaily.set('g:9', { date: new Date(1_000_000).toDateString(), count: 20 })
  await handleImageGen(daily.deps)
  assert.match(daily.replies[0], /今天画得够多/)
})

test('成功：落盘并发送', async () => {
  const { deps, replies, sends } = harness()
  await handleImageGen(deps)
  assert.match(replies[0], /正在努力作画/)
  assert.equal(sends.length, 1)
  assert.equal(deps.genDaily.get('g:9').count, 1)
  assert.equal(readdirSync(deps.imageDir).length, 1)
})

test('生图失败 / 空 buffer', async () => {
  const fail = harness({ generateImage: async () => { throw new Error('quota') } })
  await handleImageGen(fail.deps)
  assert.match(fail.replies.at(-1), /生图失败/)

  const empty = harness({ generateImage: async () => ({ buffer: Buffer.alloc(0) }) })
  await handleImageGen(empty.deps)
  assert.match(empty.replies.at(-1), /生成结果为空/)
  assert.equal(empty.sends.length, 0)
})

test('提示词裁剪到上限', async () => {
  const { deps, sends } = harness({ prompt: 'x'.repeat(500), config: { imageGenMaxPromptChars: 20, imageGenCooldownSeconds: 60 } })
  await handleImageGen(deps)
  assert.equal(sends.length, 1)
})
