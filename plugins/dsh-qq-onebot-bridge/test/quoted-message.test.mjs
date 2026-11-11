import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveQuoted } from '../lib/services/quoted-message.js'

function harness(overrides = {}) {
  const linesState = []
  const deps = {
    message: { bot: 'b', reply: { messageId: 'm1' } },
    config: { visionMode: 'native', visionEnabled: true, sttEnabled: true, visionToolName: 'qq_see_image' },
    server: { getMsg: async () => ({ message: [] }) },
    quoteDir: 'D:/q',
    stickerMsgMap: new Map([['m1', '猫猫']]),
    setQuoteState: (s) => linesState.push(s),
    extractQuoteParts: () => ({ texts: [], images: [], records: [] }),
    downloadTo: async (_url, _dir, name) => `D:/q/${name}.png`,
    extractGifFrame: async () => null,
    imageBlocksFor: async (files) => files.map((f) => ({ type: 'image', path: f })),
    fetchVoiceAudio: async () => ({ base64: 'x' }),
    transcribe: async () => '语音内容',
    debugLog: () => {},
    now: () => 1000,
    ...overrides,
  }
  return { deps, linesState }
}

test('纯文字', async () => {
  const { deps } = harness({ extractQuoteParts: () => ({ texts: ['你好', '呀'], images: [], records: [] }) })
  const out = await resolveQuoted(deps)
  assert.deepEqual(out.lines, ['用户引用的消息内容：你好呀'])
  assert.equal(out.hasVoice, false)
})

test('native 图片：下载并附 blocks', async () => {
  const { deps } = harness({ extractQuoteParts: () => ({ texts: [], images: ['http://a.png'], records: [] }) })
  const out = await resolveQuoted(deps)
  assert.equal(out.blocks.length, 1)
  assert.match(out.lines[0], /已附在本条消息中/)
})

test('非 native：只给本地路径', async () => {
  const { deps } = harness({
    config: { visionMode: 'tool', visionToolName: 'qq_see_image' },
    extractQuoteParts: () => ({ texts: [], images: ['http://a.png'], records: [] }),
  })
  const out = await resolveQuoted(deps)
  assert.match(out.lines[0], /qq_see_image/)
  assert.deepEqual(out.blocks, [])
})

test('图片下载失败', async () => {
  const { deps } = harness({
    extractQuoteParts: () => ({ texts: [], images: ['http://a.png'], records: [] }),
    downloadTo: async () => { throw new Error('boom') },
  })
  const out = await resolveQuoted(deps)
  assert.match(out.lines[0], /下载失败/)
})

test('语音：开启/关闭/失败', async () => {
  const ok = harness({ extractQuoteParts: () => ({ texts: [], images: [], records: [{}] }) })
  assert.match((await resolveQuoted(ok.deps)).lines[0], /语音内容/)

  const off = harness({ config: { sttEnabled: false }, extractQuoteParts: () => ({ texts: [], images: [], records: [{}] }) })
  assert.match((await resolveQuoted(off.deps)).lines[0], /未开启/)

  const bad = harness({
    extractQuoteParts: () => ({ texts: [], images: [], records: [{}] }),
    transcribe: async () => { throw new Error('stt') },
  })
  assert.match((await resolveQuoted(bad.deps)).lines[0], /转文字失败/)
})

test('记录引用图片与表情状态', async () => {
  const { deps, linesState } = harness({ extractQuoteParts: () => ({ texts: [], images: ['http://a.png'], records: [] }) })
  await resolveQuoted(deps)
  assert.equal(linesState.some((s) => Array.isArray(s.images)), true)
  assert.equal(linesState.some((s) => s.stickerName === '猫猫'), true)
})
