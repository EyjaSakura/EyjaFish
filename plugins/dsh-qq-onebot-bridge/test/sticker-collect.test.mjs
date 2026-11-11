import test from 'node:test'
import assert from 'node:assert/strict'
import { collectSticker } from '../lib/services/sticker-collect.js'

function harness(overrides = {}) {
  const calls = []
  const collected = []
  const faces = {
    addRemoteImage: async (url, name) => ({ name, md5: 'm', file: 'f' }),
    save: () => calls.push('save'),
  }
  return {
    calls, collected,
    deps: {
      message: { messageId: 5, raw: { message: [{ type: 'image', data: { url: 'http://x', sub_type: 1 } }] } },
      faces,
      stickerMsgLink: (id, name) => calls.push(['link', id, name]),
      now: 1000,
      debugLog: () => {},
      onCollected: (p) => collected.push(p),
      ...overrides,
    },
  }
}

test('无 raw / 非图片 / file:// 都跳过', async () => {
  const a = harness({ message: {} })
  await collectSticker(a.deps)
  assert.equal(a.calls.length, 0)

  const b = harness({ message: { raw: { message: [{ type: 'text' }] } } })
  await collectSticker(b.deps)
  assert.equal(b.calls.length, 0)

  const c = harness({ message: { raw: { message: [{ type: 'image', data: { file: 'file://x' } }] } } })
  await collectSticker(c.deps)
  assert.equal(c.calls.length, 0)
})

test('成功收集：链接 + save + 回调', async () => {
  const h = harness()
  await collectSticker(h.deps)
  assert.deepEqual(h.calls[0], ['link', 5, '表情' + (1000).toString(36).slice(-4)])
  assert.equal(h.calls.includes('save'), true)
  assert.equal(h.collected[0].name, '表情' + (1000).toString(36).slice(-4))
})

test('重复表情保留已有 name', async () => {
  const h = harness({
    faces: { addRemoteImage: async () => ({ name: '已有', md5: 'm', file: 'f' }), save: () => {} },
  })
  await collectSticker(h.deps)
  assert.equal(h.collected[0].name, '已有')
  assert.equal(h.collected[0].duplicate, true)
})

test('addRemoteImage 抛错只记日志', async () => {
  const logs = []
  const h = harness({
    faces: { addRemoteImage: async () => { throw new Error('bad') } },
    debugLog: (m) => logs.push(m),
  })
  await collectSticker(h.deps)
  assert.equal(logs.some((m) => /sticker collect failed/.test(m)), true)
  assert.equal(h.collected.length, 0)
})
