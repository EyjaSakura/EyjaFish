import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchVoiceAudio } from '../lib/services/voice-audio.js'

const message = { bot: {} }

test('get_record 返回 base64：优先 mp3', async () => {
  const r = await fetchVoiceAudio({
    message,
    record: { file: 'x.mp3' },
    getRecord: async (bot, file, fmt) => ({ base64: fmt === 'mp3' ? 'AAA' : '' }),
  })
  assert.deepEqual(r, { base64: 'AAA', ext: 'mp3' })
})

test('get_record 返回 base64:// file 也能取', async () => {
  const r = await fetchVoiceAudio({
    message,
    record: { file: 'x' },
    getRecord: async () => ({ file: 'base64://BBB' }),
  })
  assert.equal(r.base64, 'BBB')
})

test('mp3 失败后回退 wav', async () => {
  const r = await fetchVoiceAudio({
    message,
    record: { file: 'x' },
    getRecord: async (bot, file, fmt) => {
      if (fmt === 'mp3') throw new Error('no mp3')
      return { base64: 'WAV' }
    },
  })
  assert.deepEqual(r, { base64: 'WAV', ext: 'wav' })
})

test('无 get_record 时走 URL 下载', async () => {
  const r = await fetchVoiceAudio({
    message,
    record: { url: 'https://x/a' },
    getRecord: async () => { throw new Error('no') },
    fetchImpl: async () => ({ ok: true, arrayBuffer: async () => Buffer.from('abc') }),
  })
  assert.equal(r.ext, 'mp3')
  assert.equal(Buffer.from(r.base64, 'base64').toString(), 'abc')
})

test('URL 下载失败 / 空内容 / 无来源', async () => {
  await assert.rejects(() => fetchVoiceAudio({
    message, record: { url: 'https://x' }, getRecord: async () => ({}),
    fetchImpl: async () => ({ ok: false, status: 500 }),
  }), /HTTP 500/)
  await assert.rejects(() => fetchVoiceAudio({
    message, record: { url: 'https://x' }, getRecord: async () => ({}),
    fetchImpl: async () => ({ ok: true, arrayBuffer: async () => Buffer.alloc(0) }),
  }), /empty/)
  await assert.rejects(() => fetchVoiceAudio({
    message, record: {}, getRecord: async () => ({}),
  }), /无法获取语音文件/)
})
