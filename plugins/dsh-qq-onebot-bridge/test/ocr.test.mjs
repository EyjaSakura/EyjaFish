import test from 'node:test'
import assert from 'node:assert/strict'
import { collectOcrCandidates, ocrImages } from '../lib/services/ocr.js'

const isAbsolute = (p) => /^[A-Za-z]:[\\/]/.test(p)

test('collect：引用图片 + 消息图片，绝对路径优先', () => {
  const list = collectOcrCandidates({
    replyMessage: { message: [
      { type: 'image', data: { file: 'D:/a.png' } },
      { type: 'image', data: { url: 'https://x/b.png' } },
      { type: 'text', data: { text: 'x' } },
    ] },
    images: [
      { file: 'D:/c.png' },
      { url: 'https://x/d.png' },
      {},
    ],
    isAbsolute,
    exists: (p) => p === 'D:/a.png' || p === 'D:/c.png',
  })
  assert.deepEqual(list, ['D:/a.png', 'https://x/b.png', 'D:/c.png', 'https://x/d.png'])
})

test('ocrImages：数组文本 / 字符串 / 空结果', async () => {
  const parts = await ocrImages({
    candidates: ['a', 'b', 'c'],
    ocrImage: async (_s, file) => {
      if (file === 'a') return { texts: [{ text: '第一行' }, { text: '第二行' }] }
      if (file === 'b') return { text: '单字符串' }
      return {}
    },
    socket: 'sock',
  })
  assert.deepEqual(parts, ['第一行\n第二行', '单字符串', '（这张图没识别出文字）'])
})

test('ocrImages：http 先下载；失败记账', async () => {
  const downloaded = []
  const parts = await ocrImages({
    candidates: ['https://x/a.png', 'D:/b.png'],
    imageDir: 'D:/img',
    socket: 's',
    download: async (url, dir, name) => { downloaded.push([url, dir, name]); return 'D:/tmp/a.png' },
    ocrImage: async (_s, file) => {
      if (file === 'D:/tmp/a.png') return { texts: [{ text: 'ok' }] }
      throw new Error('ocr down')
    },
    debugLog: () => {},
  })
  assert.equal(downloaded.length, 1)
  assert.deepEqual(parts, ['ok', '（第 2 张识别失败：ocr down）'])
})

test('maxImages 限制', async () => {
  let calls = 0
  await ocrImages({ candidates: ['a', 'b', 'c'], maxImages: 1, ocrImage: async () => { calls += 1; return { texts: [{ text: 'x' }] } } })
  assert.equal(calls, 1)
})
