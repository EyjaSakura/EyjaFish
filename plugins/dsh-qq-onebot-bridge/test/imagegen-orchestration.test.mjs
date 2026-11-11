import test from 'node:test'
import assert from 'node:assert/strict'
import { generateImage, resolveKey, loadConfig, listProviders } from '../lib/services/imagegen/index.js'
import { ImageError } from '../lib/services/imagegen/types.js'

function config(overrides = {}) {
  return {
    provider: 'a',
    fallback: ['b'],
    cache: false,
    providers: {
      a: { type: 'x', model: 'ma' },
      b: { type: 'y', model: 'mb' },
    },
    ...overrides,
  }
}

function deps({ failA = false, failB = false, cached = null } = {}) {
  const calls = { a: 0, b: 0, put: 0, log: [] }
  const adapters = {
    x: { generate: async () => { calls.a += 1; if (failA) throw new Error('a down'); return { buffer: Buffer.from('a'), format: 'png' } } },
    y: { generate: async () => { calls.b += 1; if (failB) throw new Error('b down'); return { buffer: Buffer.from('b'), format: 'png' } } },
  }
  return {
    calls,
    deps: {
      config: config(),
      adapters,
      cache: {
        key: () => 'k',
        get: () => cached,
        put: () => { calls.put += 1 },
      },
      logUsage: (e) => calls.log.push(e),
      estimateCost: () => 0,
    },
  }
}

test('空提示词直接拒绝', async () => {
  await assert.rejects(() => generateImage({}, '  '), (e) => e.code === 'CONFIG')
})

test('第一个失败自动 fallback 到第二个', async () => {
  const { deps: d, calls } = deps({ failA: true })
  const r = await generateImage({}, '猫', { deps: d })
  assert.equal(r.provider, 'b')
  assert.equal(calls.a, 1)
  assert.equal(calls.b, 1)
})

test('缓存命中：不调用 provider，cost=0', async () => {
  const { deps: d, calls } = deps({ cached: { buffer: Buffer.from('c'), format: 'png' } })
  const r = await generateImage({}, '猫', { deps: { ...d, config: config({ cache: true }) } })
  assert.equal(r.cached, true)
  assert.equal(r.cost, 0)
  assert.equal(calls.a, 0)
})

test('fatal 错误不 fallback', async () => {
  const { deps: d } = deps()
  d.adapters.x.generate = async () => { throw new ImageError('POLICY', '审核不通过', { fatal: true }) }
  await assert.rejects(() => generateImage({}, '猫', { deps: d }), (e) => e.code === 'POLICY')
})

test('全部失败抛最后一个错误', async () => {
  const { deps: d } = deps({ failA: true, failB: true })
  await assert.rejects(() => generateImage({}, '猫', { deps: d }))
})

test('成功时写缓存并记账', async () => {
  const { deps: d, calls } = deps()
  const r = await generateImage({}, '猫', { deps: { ...d, config: config({ cache: true }) } })
  assert.equal(r.provider, 'a')
  assert.equal(calls.put, 1)
  assert.ok(calls.log.some((e) => e.ok === true))
})


test('没有配置 provider 直接拒绝', async () => {
  await assert.rejects(
    () => generateImage({}, '猫', { deps: { config: { provider: '', fallback: [], providers: {} } } }),
    (e) => e.code === 'CONFIG',
  )
})

test('resolveKey 支持 apiKey 与 keyFile', () => {
  assert.equal(resolveKey({ apiKey: 'k' }), 'k')
  assert.equal(resolveKey({}), '')
  assert.equal(resolveKey({ keyFile: 'D:\\definitely-missing.json' }), '')
})

test('loadConfig 返回配置对象且缓存复用', () => {
  const a = loadConfig({})
  const b = loadConfig({})
  assert.equal(typeof a, 'object')
  assert.equal(a, b)
})

test('listProviders 返回数组', () => {
  assert.ok(Array.isArray(listProviders({})))
})
