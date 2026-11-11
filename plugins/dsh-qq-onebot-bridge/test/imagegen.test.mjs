import test from 'node:test'
import assert from 'node:assert/strict'
import { sniffFormat, parseSize, formatSize, ImageError, fromHttpError } from '../lib/services/imagegen/types.js'
import { estimateCost } from '../lib/services/imagegen/cost.js'
import { validate as openaiValidate, buildRequest as openaiBuild, parseResponse as openaiParse, generate as openaiGenerate } from '../lib/services/imagegen/providers/openai.js'
import { validate as dashscopeValidate, buildRequest as dashscopeBuild, generate as dashscopeGenerate } from '../lib/services/imagegen/providers/dashscope.js'
import { buildUrl as pollinationsUrl, generate as pollinationsGenerate } from '../lib/services/imagegen/providers/pollinations.js'
import { validate as localValidate, buildRequest as localBuild, generate as localGenerate } from '../lib/services/imagegen/providers/local-sd.js'
import { cacheKey } from '../lib/services/imagegen/cache.js'

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test('sniffFormat 识别 png/jpeg', () => {
  assert.equal(sniffFormat(PNG_1x1), 'png')
  assert.equal(sniffFormat(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), 'jpeg')
})

test('parseSize / formatSize', () => {
  assert.deepEqual(parseSize('1024x768'), { width: 1024, height: 768 })
  assert.deepEqual(parseSize('512*512'), { width: 512, height: 512 })
  assert.equal(formatSize('1024x768', '*'), '1024*768')
  assert.deepEqual(parseSize('bad'), { width: 1024, height: 1024 })
})

test('estimateCost 已知/未知模型', () => {
  assert.equal(estimateCost('cogview-3-flash'), 0)
  assert.equal(estimateCost('wanx2.1-t2i-turbo'), 0.15)
  assert.equal(estimateCost('unknown-model'), null)
  assert.equal(estimateCost('x', { cost: 0.5 }), 0.5)
})

test('openai 请求体', () => {
  const body = openaiBuild({ model: 'cogview-3-flash' }, { prompt: '猫', size: '512x512' })
  assert.equal(body.model, 'cogview-3-flash')
  assert.equal(body.prompt, '猫')
  assert.equal(body.size, '512x512')
  assert.equal(body.response_format, 'b64_json')
})

test('openai 解析 b64 响应', async () => {
  const r = await openaiParse({ name: 'test' }, { data: [{ b64_json: PNG_1x1.toString('base64') }] }, 1000)
  assert.equal(r.format, 'png')
  assert.equal(r.buffer.length, PNG_1x1.length)
})

test('openai 空响应报错', async () => {
  await assert.rejects(() => openaiParse({ name: 'test' }, { data: [] }, 1000), /未返回图片/)
})

test('dashscope 请求体尺寸用 *', () => {
  const body = dashscopeBuild({ model: 'wanx2.1-t2i-turbo' }, { prompt: '猫', size: '1024x768', negativePrompt: '糊' })
  assert.equal(body.model, 'wanx2.1-t2i-turbo')
  assert.equal(body.parameters.size, '1024*768')
  assert.equal(body.input.negative_prompt, '糊')
})

test('pollinations URL 含 prompt 和尺寸', () => {
  const url = pollinationsUrl({ model: 'flux' }, { prompt: '蓝鲸 星空', size: '768x768' })
  assert.match(url, /image\.pollinations\.ai\/prompt\//)
  assert.match(url, /width=768/)
  assert.match(url, /height=768/)
  assert.match(url, /nologo=true/)
})

test('cacheKey 稳定且随参数变化', () => {
  const a = cacheKey({ provider: 'p', model: 'm', prompt: 'x', size: '1x1', seed: 1 })
  const b = cacheKey({ provider: 'p', model: 'm', prompt: 'x', size: '1x1', seed: 1 })
  const c = cacheKey({ provider: 'p', model: 'm', prompt: 'x', size: '1x1', seed: 2 })
  assert.equal(a, b)
  assert.notEqual(a, c)
})

test('错误映射：401 致命、429 非致命、5xx 非致命', () => {
  assert.equal(fromHttpError('p', 401, 'bad').fatal, true)
  assert.equal(fromHttpError('p', 429, 'slow').code, 'RATE')
  assert.equal(fromHttpError('p', 500, 'boom').code, 'PROVIDER')
  assert.equal(fromHttpError('p', 400, '内容审核不通过').code, 'POLICY')
  assert.ok(new ImageError('EMPTY', 'x').message === 'x')
})


test('openai generate：b64 响应返回图片', async () => {
  const orig = globalThis.fetch
  globalThis.fetch = async () => ({
    ok: true, status: 200,
    json: async () => ({ data: [{ b64_json: PNG_1x1.toString('base64') }] }),
    text: async () => '',
  })
  try {
    const r = await openaiGenerate({ prompt: '猫', size: '1x1' }, { name: 't', model: 'm', baseUrl: 'http://x', apiKey: 'k' })
    assert.equal(r.format, 'png')
    assert.equal(r.buffer.length, PNG_1x1.length)
  } finally { globalThis.fetch = orig }
})

test('openai generate：HTTP 401 致命错误', async () => {
  const orig = globalThis.fetch
  globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => 'bad', json: async () => null })
  try {
    await assert.rejects(() => openaiGenerate({ prompt: 'x' }, { name: 't', baseUrl: 'http://x' }), (e) => e.fatal === true)
  } finally { globalThis.fetch = orig }
})


test('pollinations generate：图片响应', async () => {
  const orig = globalThis.fetch
  globalThis.fetch = async () => ({
    ok: true, status: 200,
    headers: { get: () => 'image/png' },
    arrayBuffer: async () => PNG_1x1,
    text: async () => '',
  })
  try {
    const r = await pollinationsGenerate({ prompt: '猫', size: '1x1' }, { name: 'pollinations' })
    assert.equal(r.format, 'png')
    assert.equal(r.buffer.length, PNG_1x1.length)
  } finally { globalThis.fetch = orig }
})

test('pollinations generate：非图片 content-type 报错', async () => {
  const orig = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, status: 200, headers: { get: () => 'text/html' }, arrayBuffer: async () => Buffer.from(''), text: async () => '' })
  try {
    await assert.rejects(() => pollinationsGenerate({ prompt: 'x' }, { name: 'p' }), /不是图片/)
  } finally { globalThis.fetch = orig }
})

test('pollinations generate：HTTP 500 报错', async () => {
  const orig = globalThis.fetch
  globalThis.fetch = async () => ({ ok: false, status: 500, headers: { get: () => '' }, arrayBuffer: async () => Buffer.from(''), text: async () => 'err' })
  try {
    await assert.rejects(() => pollinationsGenerate({ prompt: 'x' }, { name: 'p' }), /HTTP 500/)
  } finally { globalThis.fetch = orig }
})


test('dashscope generate：提交 → 轮询成功 → 下载图片', async () => {
  const orig = globalThis.fetch
  globalThis.fetch = async (url) => {
    const u = String(url)
    if (u.includes('/image-synthesis')) return { ok: true, status: 200, json: async () => ({ output: { task_id: 't1' } }), text: async () => '' }
    if (u.startsWith('http://img/')) return { ok: true, status: 200, arrayBuffer: async () => PNG_1x1, headers: { get: () => 'image/png' }, text: async () => '' }
    return { ok: true, status: 200, json: async () => ({ output: { task_status: 'SUCCEEDED', results: [{ url: 'http://img/1.png' }] } }), text: async () => '' }
  }
  try {
    const r = await dashscopeGenerate(
      { prompt: '猫' },
      { name: 'dashscope', baseUrl: 'http://x', apiKey: 'k', pollIntervalMs: 1, sleep: async () => {} },
    )
    assert.equal(r.format, 'png')
    assert.equal(r.buffer.length, PNG_1x1.length)
  } finally { globalThis.fetch = orig }
})

test('dashscope generate：FAILED 状态报错', async () => {
  const orig = globalThis.fetch
  globalThis.fetch = async (url) => {
    const u = String(url)
    if (u.includes('/image-synthesis')) return { ok: true, status: 200, json: async () => ({ output: { task_id: 't1' } }), text: async () => '' }
    return { ok: true, status: 200, json: async () => ({ output: { task_status: 'FAILED', message: '审核不通过' } }), text: async () => '' }
  }
  try {
    await assert.rejects(
      () => dashscopeGenerate({ prompt: 'x' }, { name: 'dashscope', baseUrl: 'http://x', sleep: async () => {} }),
      /百炼任务失败/,
    )
  } finally { globalThis.fetch = orig }
})

test('dashscope generate：没有 task_id 报错', async () => {
  const orig = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '' })
  try {
    await assert.rejects(() => dashscopeGenerate({ prompt: 'x' }, { name: 'dashscope', baseUrl: 'http://x' }), /task_id/)
  } finally { globalThis.fetch = orig }
})


test('local-sd：validate 缺 baseUrl 报错', () => {
  assert.throws(() => localValidate({ name: 'local' }), /缺少 baseUrl/)
  assert.doesNotThrow(() => localValidate({ name: 'local', baseUrl: 'http://x' }))
})

test('local-sd：buildRequest 尺寸与步数夹紧', () => {
  const body = localBuild({ size: '768x512', steps: 999, cfgScale: 99, negativePrompt: '糊' }, { baseUrl: 'http://x' })
  assert.equal(body.width, 768)
  assert.equal(body.height, 512)
  assert.equal(body.steps, 100)
  assert.equal(body.cfg_scale, 30)
  assert.equal(body.negative_prompt, '糊')
})

test('local-sd generate：成功返回图片', async () => {
  const orig = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ images: [PNG_1x1.toString('base64')] }) })
  try {
    const r = await localGenerate({ prompt: '猫' }, { name: 'local', baseUrl: 'http://x' })
    assert.equal(r.format, 'png')
  } finally { globalThis.fetch = orig }
})

test('local-sd generate：HTTP 错误与空图片', async () => {
  const orig = globalThis.fetch
  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => null })
  try {
    await assert.rejects(() => localGenerate({ prompt: 'x' }, { name: 'local', baseUrl: 'http://x' }), /HTTP 503/)
  } finally { globalThis.fetch = orig }
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) })
  try {
    await assert.rejects(() => localGenerate({ prompt: 'x' }, { name: 'local', baseUrl: 'http://x' }), /未返回图片/)
  } finally { globalThis.fetch = orig }
})


test('openai generate：url 响应会下载图片', async () => {
  const orig = globalThis.fetch
  globalThis.fetch = async (url) => {
    if (String(url).startsWith('http://img/')) {
      return { ok: true, status: 200, arrayBuffer: async () => PNG_1x1, json: async () => null, text: async () => '' }
    }
    return { ok: true, status: 200, json: async () => ({ data: [{ url: 'http://img/1.png' }] }), text: async () => '' }
  }
  try {
    const r = await openaiGenerate({ prompt: '猫' }, { name: 't', model: 'm', baseUrl: 'http://x', apiKey: 'k' })
    assert.equal(r.format, 'png')
  } finally { globalThis.fetch = orig }
})

test('openai generate：响应缺少图片内容报错', async () => {
  const orig = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ data: [{}] }), text: async () => '' })
  try {
    await assert.rejects(() => openaiGenerate({ prompt: 'x' }, { name: 't', baseUrl: 'http://x' }), /缺少图片内容/)
  } finally { globalThis.fetch = orig }
})


test('openai：url 下载失败报错', async () => {
  const orig = globalThis.fetch
  globalThis.fetch = async (url) => {
    if (String(url).startsWith('http://img/')) return { ok: false, status: 404, arrayBuffer: async () => Buffer.from(''), text: async () => '' }
    return { ok: true, status: 200, json: async () => ({ data: [{ url: 'http://img/x.png' }] }), text: async () => '' }
  }
  try {
    await assert.rejects(() => openaiGenerate({ prompt: 'x' }, { name: 't', baseUrl: 'http://x' }), /下载生成图片失败/)
  } finally { globalThis.fetch = orig }
})

test('openai：网络异常包装成 ImageError', async () => {
  const orig = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('network down') }
  try {
    await assert.rejects(() => openaiGenerate({ prompt: 'x' }, { name: 't', baseUrl: 'http://x' }), (e) => e.code === 'PROVIDER')
  } finally { globalThis.fetch = orig }
})

test('dashscope：提交 HTTP 失败直接报错', async () => {
  const orig = globalThis.fetch
  globalThis.fetch = async () => ({ ok: false, status: 500, text: async () => 'boom', json: async () => null })
  try {
    await assert.rejects(() => dashscopeGenerate({ prompt: 'x' }, { name: 'dashscope', baseUrl: 'http://x' }))
  } finally { globalThis.fetch = orig }
})


test('openai.validate 缺字段报 CONFIG', () => {
  assert.throws(() => openaiValidate({ name: 't' }), /缺少 baseUrl/)
  assert.throws(() => openaiValidate({ name: 't', baseUrl: 'http://x' }), /缺少 model/)
  assert.throws(() => openaiValidate({ name: 't', baseUrl: 'http://x', model: 'm' }), /缺少 apiKey/)
  assert.doesNotThrow(() => openaiValidate({ name: 't', baseUrl: 'http://x', model: 'm', apiKey: 'k' }))
})

test('openai.buildRequest 支持 negative/seed', () => {
  const body = openaiBuild({ model: 'm', supportsNegative: true, supportsSeed: true }, { prompt: 'p', negativePrompt: 'n', seed: 7 })
  assert.equal(body.negative_prompt, 'n')
  assert.equal(body.seed, 7)
})

test('dashscope.validate 缺字段报 CONFIG', () => {
  assert.throws(() => dashscopeValidate({ name: 'd' }), /缺少 baseUrl/)
  assert.throws(() => dashscopeValidate({ name: 'd', baseUrl: 'http://x' }), /缺少 model/)
  assert.throws(() => dashscopeValidate({ name: 'd', baseUrl: 'http://x', model: 'm' }), /缺少 apiKey/)
  assert.doesNotThrow(() => dashscopeValidate({ name: 'd', baseUrl: 'http://x', model: 'm', apiKey: 'k' }))
})

test('dashscope.buildRequest 支持 negative/seed', () => {
  const body = dashscopeBuild({ model: 'm' }, { prompt: 'p', negativePrompt: 'n', seed: 7 })
  assert.equal(body.input.negative_prompt, 'n')
  assert.equal(body.parameters.seed, 7)
})


test('openai.parseResponse：空图片报 EMPTY', async () => {
  await assert.rejects(() => openaiParse({ name: 't' }, { data: [{ b64_json: '' }] }, 1000), (e) => e.code === 'EMPTY')
})
