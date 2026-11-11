import test from 'node:test'
import assert from 'node:assert/strict'
import { sendVoiceTo } from '../lib/services/send-voice.js'

function harness(overrides = {}) {
  const calls = []
  return {
    calls,
    deps: {
      route: { bot: {}, messageType: 'private', targetId: 1 },
      text: 'hello',
      config: { ttsMaxChars: 10 },
      ttsUsable: () => true,
      synthVoiceFile: async (spoken) => { calls.push(['synth', spoken]); return { file: '/tmp/a.mp3', bytes: 2048 } },
      toOneBotFileSource: (f) => 'file://' + f,
      readFile: () => Buffer.from('abc'),
      sendSegments: async (...args) => { calls.push(['send', args]); return { message_id: 5 } },
      trackSent: (key, data) => calls.push(['track', key, data]),
      chatKeyOf: () => 'u:1',
      debugLog: (m) => calls.push(['log', m]),
      ...overrides,
    },
  }
}

test('TTS 不可用抛错', async () => {
  const h = harness({ ttsUsable: () => false })
  await assert.rejects(() => sendVoiceTo(h.deps), /未配置 TTS/)
})

test('Linux 路径不转 base64，发送并记账', async () => {
  const h = harness()
  const r = await sendVoiceTo(h.deps)
  const seg = h.calls.find((c) => c[0] === 'send')[1][3][0]
  assert.equal(seg.data.file, 'file:///tmp/a.mp3')
  assert.equal(h.calls.some((c) => c[0] === 'track' && c[1] === 'u:1'), true)
  assert.match(r, /已发送语音（2 KB）/)
})

test('Windows 路径转 base64；读取失败回退路径', async () => {
  const win = harness({ synthVoiceFile: async () => ({ file: 'D:/a.mp3', bytes: 10 }) })
  await sendVoiceTo(win.deps)
  assert.match(win.calls.find((c) => c[0] === 'send')[1][3][0].data.file, /^base64:\/\//)

  const bad = harness({
    synthVoiceFile: async () => ({ file: 'D:/a.mp3', bytes: 10 }),
    readFile: () => { throw new Error('io') },
  })
  await sendVoiceTo(bad.deps)
  assert.equal(bad.calls.find((c) => c[0] === 'send')[1][3][0].data.file, 'file://D:/a.mp3')
})

test('超长文本截断后再合成', async () => {
  const h = harness({ text: 'a'.repeat(50) })
  await sendVoiceTo(h.deps)
  assert.equal(h.calls.find((c) => c[0] === 'synth')[1].length, 12)
  assert.match(h.calls.find((c) => c[0] === 'synth')[1], /……$/)
})
