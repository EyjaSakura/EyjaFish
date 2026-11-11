import test from 'node:test'
import assert from 'node:assert/strict'
import { extractQuoteParts } from '../lib/services/quoted-content.js'

test('文本 / 表情 / at', () => {
  const r = extractQuoteParts([
    { type: 'text', data: { text: ' 你好 ' } },
    { type: 'face', data: { id: 14 } },
    { type: 'at', data: { qq: '10001' } },
  ])
  assert.deepEqual(r.texts, ['你好', '[黄脸表情14]', '@10001'])
})

test('图片过滤 file://，语音保留字段', () => {
  const r = extractQuoteParts([
    { type: 'image', data: { url: 'https://a/1.png' } },
    { type: 'image', data: { file: 'file:///tmp/x.png' } },
    { type: 'image', data: {} },
    { type: 'record', data: { file: 'a.silk', url: 'http://x/a', path: 'D:/a' } },
  ])
  assert.deepEqual(r.images, ['https://a/1.png'])
  assert.deepEqual(r.records, [{ file: 'a.silk', url: 'http://x/a', path: 'D:/a' }])
})

test('非法输入返回空数组', () => {
  assert.deepEqual(extractQuoteParts(null), { texts: [], images: [], records: [] })
  assert.deepEqual(extractQuoteParts([null, 1, 'x', {}]), { texts: [], images: [], records: [] })
})
