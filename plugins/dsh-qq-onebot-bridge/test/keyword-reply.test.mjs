import test from 'node:test'
import assert from 'node:assert/strict'
import { handleKeyword, keywordImage } from '../lib/services/keyword-reply.js'

function harness(overrides = {}) {
  const calls = []
  return {
    calls,
    deps: {
      message: { messageType: 'group' },
      text: '你好',
      keywordStore: { match: () => ({ trigger: '你好', reply: '你也好' }) },
      routeKey: () => 'g:9',
      recordMemory: (k, role, t) => calls.push(['mem', role, t]),
      safeReply: async (m, t) => calls.push(['reply', t]),
      keywordImage: async () => 'D:/img.png',
      sendImage: async (route, file) => calls.push(['img', file]),
      routeOf: () => 'route',
      debugLog: (m) => calls.push(['log', m]),
      ...overrides,
    },
  }
}

test('空文本 / 未命中 / match 抛错', async () => {
  assert.equal(await handleKeyword(harness({ text: '' }).deps), false)
  assert.equal(await handleKeyword(harness({ keywordStore: { match: () => null } }).deps), false)
  const logs = []
  const bad = harness({ keywordStore: { match: () => { throw new Error('db') } }, debugLog: (m) => logs.push(m) })
  assert.equal(await handleKeyword(bad.deps), false)
  assert.match(logs[0], /keyword match failed/)
})

test('文本回复：记录 user/assistant 两条', async () => {
  const h = harness()
  assert.equal(await handleKeyword(h.deps), true)
  assert.deepEqual(h.calls.filter((c) => c[0] === 'mem').map((c) => c[1]), ['user', 'assistant'])
  assert.equal(h.calls.some((c) => c[0] === 'reply' && c[1] === '你也好'), true)
})

test('图片命中：发送图片', async () => {
  const h = harness({ keywordStore: { match: () => ({ trigger: '图', image: 'a.png' }) } })
  assert.equal(await handleKeyword(h.deps), true)
  assert.equal(h.calls.some((c) => c[0] === 'img' && c[1] === 'D:/img.png'), true)
})

test('图片失败只记日志', async () => {
  const h = harness({
    keywordStore: { match: () => ({ trigger: '图', image: 'missing.png' }) },
    keywordImage: async () => { throw new Error('no file') },
  })
  assert.equal(await handleKeyword(h.deps), true)
  assert.equal(h.calls.some((c) => c[0] === 'log' && /keyword image failed/.test(c[1])), true)
})

test('keywordImage：http 下载 / 本地存在 / 本地缺失', async () => {
  const dl = await keywordImage({ image: 'https://x/a.png', imageDir: 'D:/img', downloadTo: async () => 'D:/img/a.png' })
  assert.equal(dl, 'D:/img/a.png')

  const local = await keywordImage({ image: 'a.png', cwd: 'D:/cwd', exists: () => true, downloadTo: async () => '' })
  assert.match(local, /a\.png$/)

  await assert.rejects(() => keywordImage({ image: 'a.png', cwd: 'D:/cwd', exists: () => false, downloadTo: async () => '' }), /图片不存在/)
})
