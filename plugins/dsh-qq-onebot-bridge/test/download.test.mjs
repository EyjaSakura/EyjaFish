import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { downloadTo, guessImageExt } from '../lib/services/download.js'

function response(buffer, type = 'image/png', ok = true, status = 200) {
  return { ok, status, headers: { get: () => type }, arrayBuffer: async () => buffer }
}

test('下载成功：按 content-type 扩展名落盘', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dl-'))
  const file = await downloadTo('https://x/a', dir, 'img', async () => response(Buffer.from('abc')))
  assert.equal(file, join(dir, 'img.png'))
  assert.ok(existsSync(file))
})

test('gif / webp / jpeg 识别', async () => {
  assert.equal(guessImageExt('image/gif', ''), '.gif')
  assert.equal(guessImageExt('image/webp', ''), '.webp')
  assert.equal(guessImageExt('image/jpeg', ''), '.jpg')
})

test('URL 无扩展名回退 .png', () => {
  assert.equal(guessImageExt('application/octet-stream', 'https://x/a'), '.png')
  assert.equal(guessImageExt('', 'https://x/a.jpg?x=1'), '.jpg')
})

test('HTTP 非 2xx 报错', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dl-'))
  await assert.rejects(() => downloadTo('https://x', dir, 'a', async () => response(Buffer.from(''), 'image/png', false, 404)), /HTTP 404/)
})

test('空内容报错', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dl-'))
  await assert.rejects(() => downloadTo('https://x', dir, 'a', async () => response(Buffer.alloc(0))), /empty/)
})
