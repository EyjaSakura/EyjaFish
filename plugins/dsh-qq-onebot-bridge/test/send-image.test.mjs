import test from 'node:test'
import assert from 'node:assert/strict'
import { sendImageTo } from '../lib/services/send-image.js'

function base(overrides = {}) {
  const calls = []
  return {
    calls,
    deps: {
      route: { bot: {}, messageType: 'group', targetId: 9 },
      file: 'D:/a.png',
      caption: 'hi',
      prepareImage: async () => 'D:/prepared.png',
      toOneBotFileSource: (f) => 'file://' + f,
      windowsPathToFileUri: () => null,
      sendSegments: async (...args) => { calls.push(['send', args]); return { message_id: 1 } },
      trackSent: (k, d) => calls.push(['track', k, d]),
      chatKeyOf: () => 'g:9',
      stat: () => ({ size: 2048 }),
      basename: (p) => p.split('/').pop(),
      debugLog: (m) => calls.push(['log', m]),
      ...overrides,
    },
  }
}

test('带 caption 发送并记账', async () => {
  const h = base()
  const r = await sendImageTo(h.deps)
  const segs = h.calls.find((c) => c[0] === 'send')[1][3]
  assert.equal(segs[0].data.text, 'hi')
  assert.equal(segs[1].data.file, 'file://D:/prepared.png')
  assert.equal(h.calls.some((c) => c[0] === 'track'), true)
  assert.match(r, /已发送图片：prepared.png（2 KB）/)
})

test('首次失败回退原生 URI', async () => {
  let n = 0
  const h = base({
    sendSegments: async () => {
      n += 1
      if (n === 1) throw new Error('bad /mnt')
      return { message_id: 2 }
    },
    windowsPathToFileUri: () => 'file:///D:/prepared.png',
  })
  await sendImageTo(h.deps)
  assert.equal(h.calls.some((c) => c[0] === 'log' && /fallback/.test(c[1])), true)
})

test('无原生路径时抛原错误', async () => {
  const h = base({ sendSegments: async () => { throw new Error('bad') } })
  await assert.rejects(() => sendImageTo(h.deps), /bad/)
})
