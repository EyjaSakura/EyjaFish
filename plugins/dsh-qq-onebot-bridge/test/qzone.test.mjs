import test from 'node:test'
import assert from 'node:assert/strict'
import { qzoneRequest } from '../lib/services/qzone.js'

function mockFetch(responses) {
  let i = 0
  return async () => {
    const r = responses[Math.min(i, responses.length - 1)]
    i += 1
    return {
      status: 200,
      text: async () => r,
    }
  }
}

test('普通 JSON code=0', async () => {
  const out = await qzoneRequest('http://x', {}, 1, { fetchImpl: mockFetch(['{"code":0,"data":1}']) })
  assert.equal(out.data, 1)
})

test('JSONP 能被解析', async () => {
  const out = await qzoneRequest('http://x', {}, 1, { fetchImpl: mockFetch(['_Callback({"code":0,"n":2});']) })
  assert.equal(out.n, 2)
})

test('繁忙先重试再成功', async () => {
  const waits = []
  const out = await qzoneRequest('http://x', {}, 3, {
    fetchImpl: mockFetch(['{"code":100,"message":"使用人数过多"}', '{"code":0,"ok":true}']),
    sleep: async (ms) => waits.push(ms),
  })
  assert.equal(out.ok, true)
  assert.equal(waits.length, 1)
})

test('空响应重试后返回 null', async () => {
  const out = await qzoneRequest('http://x', {}, 2, {
    fetchImpl: mockFetch(['', '']),
    sleep: async () => {},
  })
  assert.equal(out, null)
})

test('网络错误在最后一次抛出', async () => {
  let calls = 0
  const fetchImpl = async () => { calls += 1; throw new Error('boom') }
  await assert.rejects(() => qzoneRequest('http://x', {}, 2, { fetchImpl, sleep: async () => {} }), /boom/)
  assert.equal(calls, 2)
})


test('繁忙默认 sleep 重试（不注入 sleep/debugLog）', async () => {
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    return { status: 200, text: async () => calls === 1 ? '{"code":100,"message":"使用人数过多"}' : '{"code":0,"ok":true}' }
  }
  const out = await qzoneRequest('http://x', {}, 2, { fetchImpl })
  assert.equal(out.ok, true)
  assert.equal(calls, 2)
})
