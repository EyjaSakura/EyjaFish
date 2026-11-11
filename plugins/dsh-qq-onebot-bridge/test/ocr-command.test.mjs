import test from 'node:test'
import assert from 'node:assert/strict'
import { handleOcrCommand } from '../lib/services/ocr-command.js'

function harness(overrides = {}) {
  const replies = []
  const calls = []
  const deps = {
    message: { bot: 'b', images: [], reply: null },
    text: '/ocr',
    config: { ocrEnabled: true, ocrMaxImages: 3 },
    canRun: () => ({ allowed: true }),
    server: {
      currentSocket: () => 'sock',
      getMsg: async () => ({ message: [] }),
      ocrImage: async () => ({ texts: ['文字'] }),
    },
    safeReply: async (_m, t) => replies.push(t),
    collectOcrCandidates: () => ['D:/a.png'],
    ocrImages: async ({ candidates, maxImages }) => { calls.push(['ocr', candidates.length, maxImages]); return ['识别结果'] },
    downloadTo: async () => 'D:/q/a.png',
    imageDir: 'D:/q',
    isAbsolute: () => true,
    existsSync: () => true,
    debugLog: () => {},
    ...overrides,
  }
  return { deps, replies, calls }
}

test('关闭 / 无权限 / 非命令返回 false', async () => {
  assert.equal(await handleOcrCommand(harness({ config: { ocrEnabled: false } }).deps), false)
  assert.equal(await handleOcrCommand(harness({ canRun: () => ({ allowed: false }) }).deps), false)
  assert.equal(await handleOcrCommand(harness({ text: '你好' }).deps), false)
})

test('注入回合 / 无连接直接回复', async () => {
  const injected = harness({ message: { bot: 'b', images: [], reply: null, __injected: true } })
  assert.equal(await handleOcrCommand(injected.deps), true)
  assert.match(injected.replies[0], /回放\/注入/)

  const off = harness({ server: { currentSocket: () => null } })
  assert.equal(await handleOcrCommand(off.deps), true)
  assert.match(off.replies[0], /无可用连接/)
})

test('getMsg 失败仍用直发图片', async () => {
  const { deps, calls } = harness({
    message: { bot: 'b', images: ['D:/a.png'], reply: { messageId: 'm' } },
    server: { currentSocket: () => 's', getMsg: async () => { throw new Error('x') }, ocrImage: async () => ({}) },
  })
  assert.equal(await handleOcrCommand(deps), true)
  assert.equal(calls.length, 1)
})

test('无候选给用法', async () => {
  const { deps, replies } = harness({ collectOcrCandidates: () => [] })
  assert.equal(await handleOcrCommand(deps), true)
  assert.match(replies[0], /用法/)
})

test('成功：OCR 结果拼接回复', async () => {
  const { deps, replies, calls } = harness()
  assert.equal(await handleOcrCommand(deps), true)
  assert.match(replies[0], /图片文字识别/)
  assert.match(replies[0], /识别结果/)
  assert.deepEqual(calls[0], ['ocr', 1, 3])
})
