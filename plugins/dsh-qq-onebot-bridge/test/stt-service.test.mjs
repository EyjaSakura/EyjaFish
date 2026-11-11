import test from 'node:test'
import assert from 'node:assert/strict'
import { transcribe, transcribeViaCloud } from '../lib/services/stt-service.js'

const audio = { base64: Buffer.from('abc').toString('base64'), ext: 'mp3' }

test('云端：未配置 base', async () => {
  await assert.rejects(() => transcribeViaCloud({ audio, config: {} }), /sttBaseUrl/)
})

test('云端：HTTP 失败带 detail', async () => {
  const fetchImpl = async () => ({ ok: false, status: 500, text: async () => 'boom' })
  await assert.rejects(() => transcribeViaCloud({ audio, config: { sttBaseUrl: 'https://x' }, fetchImpl }), /STT HTTP 500: boom/)
})

test('云端：空文本', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ text: '' }) })
  await assert.rejects(() => transcribeViaCloud({ audio, config: { sttBaseUrl: 'https://x' }, fetchImpl }), /返回为空/)
})

test('云端：成功返回 text', async () => {
  const fetchImpl = async (url, opts) => {
    assert.equal(url, 'https://x/audio/transcriptions')
    assert.equal(opts.method, 'POST')
    return { ok: true, json: async () => ({ text: ' 你好 ' }) }
  }
  assert.equal(await transcribeViaCloud({ audio, config: { sttBaseUrl: 'https://x/' }, fetchImpl }), '你好')
})

test('transcribe：cloud provider 走云端', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ text: 'hi' }) })
  const r = await transcribe({ audio, config: { sttProvider: 'cloud', sttBaseUrl: 'https://x' }, resolveService: () => null, fetchImpl })
  assert.equal(r, 'hi')
})
