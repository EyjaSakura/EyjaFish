import test from 'node:test'
import assert from 'node:assert/strict'
import { imageBlocksFor } from '../lib/services/image-blocks.js'

test('空文件 / 无 attachments', async () => {
  assert.deepEqual(await imageBlocksFor({ files: [], attachments: {} }), [])
  const logs = []
  assert.deepEqual(await imageBlocksFor({ files: ['a.png'], attachments: null, debugLog: (m) => logs.push(m) }), [])
  assert.match(logs[0], /attachments service not mounted/)
})

test('按扩展名给 mediaType，最多 4 张', async () => {
  let saved
  const r = await imageBlocksFor({
    files: ['a.png', 'b.gif', 'c.webp', 'd.jpg', 'e.png'],
    attachments: { saveImages: async (images) => { saved = images; return images.map((_, i) => ({ id: i })) } },
    readFile: () => Buffer.from('x'),
  })
  assert.equal(saved.length, 4)
  assert.deepEqual(saved.map((x) => x.mediaType), ['image/png', 'image/gif', 'image/webp', 'image/jpeg'])
  assert.equal(saved[0].name, 'a.png')
  assert.equal(r.length, 4)
  assert.equal(r[0].type, 'image')
})

test('saveImages 抛错返回空数组', async () => {
  const logs = []
  const r = await imageBlocksFor({
    files: ['a.png'],
    attachments: { saveImages: async () => { throw new Error('sharp') } },
    readFile: () => Buffer.from('x'),
    debugLog: (m) => logs.push(m),
  })
  assert.deepEqual(r, [])
  assert.match(logs[0], /native image attach failed/)
})
