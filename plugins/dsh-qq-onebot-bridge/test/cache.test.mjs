import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { cacheGet, cachePut, cacheKey } from '../lib/services/imagegen/cache.js'

function dir() {
  return mkdtempSync(join(tmpdir(), 'dsh-cache-'))
}

test('cachePut → cacheGet 往返', () => {
  const d = dir()
  const key = cacheKey({ provider: 'p', model: 'm', prompt: '猫', size: '1x1', seed: 1 })
  const buf = Buffer.from('png-data')
  const file = cachePut(key, buf, 'png', d)
  assert.ok(file.endsWith('.png'))
  const hit = cacheGet(key, d)
  assert.equal(hit.format, 'png')
  assert.deepEqual(hit.buffer, buf)
})

test('jpeg 存成 jpg，读回 jpeg', () => {
  const d = dir()
  const key = 'k2'
  const file = cachePut(key, Buffer.from('j'), 'jpeg', d)
  assert.ok(file.endsWith('.jpg'))
  const hit = cacheGet(key, d)
  assert.equal(hit.format, 'jpeg')
})

test('未命中返回 null', () => {
  assert.equal(cacheGet('nope', dir()), null)
})

test('空文件不算命中', () => {
  const d = dir()
  writeFileSync(join(d, 'empty.png'), '')
  assert.equal(cacheGet('empty', d), null)
})

test('cacheKey 稳定', () => {
  const a = cacheKey({ provider: 'p', model: 'm', prompt: 'x', size: '1x1', seed: 1 })
  const b = cacheKey({ provider: 'p', model: 'm', prompt: 'x', size: '1x1', seed: 1 })
  assert.equal(a, b)
  assert.equal(a.length, 40)
})


test('写入失败返回空串', () => {
  const file = cachePut('k', Buffer.from('x'), 'png', 'Z:\\no-such-drive\\cache')
  assert.equal(file, '')
})


test('同名路径是目录时读取失败返回 null', () => {
  const d = dir()
  mkdirSync(join(d, 'weird.png'))
  assert.equal(cacheGet('weird', d), null)
})
