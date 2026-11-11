import test from 'node:test'
import assert from 'node:assert/strict'
import { parseMessage } from '../lib/onebot.js'

test('CQ 字符串：at / reply / record / image', () => {
  const raw = '[CQ:at,qq=123,name=小明] 你好 [CQ:reply,id=42,text=旧消息] [CQ:record,file=a.silk,url=http://x/a] [CQ:image,file=b.jpg,url=http://x/b]'
  const p = parseMessage(raw, 999)
  assert.equal(p.text.includes('你好'), true)
  assert.deepEqual(p.ats, [123])
  assert.equal(p.reply.messageId, '42')
  assert.equal(p.records.length, 1)
  assert.equal(p.records[0].url, 'http://x/a')
  assert.equal(p.images.length, 1)
  assert.equal(p.images[0].url, 'http://x/b')
})

test('数组消息：text / at / record / image', () => {
  const msg = [
    { type: 'text', data: { text: '在吗' } },
    { type: 'at', data: { qq: '7', name: '小明' } },
    { type: 'record', data: { file: 'v.silk', url: 'http://x/v' } },
    { type: 'image', data: { file: 'i.jpg', url: 'http://x/i' } },
  ]
  const p = parseMessage(msg, 1)
  assert.match(p.text, /在吗/)
  assert.deepEqual(p.ats, [7])
  assert.equal(p.records[0].file, 'v.silk')
  assert.equal(p.images[0].file, 'i.jpg')
})

test('空消息各字段为空', () => {
  const p = parseMessage([], 1)
  assert.equal(p.text, '')
  assert.equal(p.ats.length, 0)
  assert.equal(p.records.length, 0)
  assert.equal(p.images.length, 0)
})
