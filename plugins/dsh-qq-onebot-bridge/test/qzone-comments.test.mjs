import test from 'node:test'
import assert from 'node:assert/strict'
import { scanQzoneComments, qzoneCommentPrompt } from '../lib/services/qzone-comments.js'

const now = Date.parse('2026-11-08T12:00:00Z')

test('新评论入队，已读跳过，自己的评论只标记', () => {
  const list = [{
    tid: 'p1',
    commentlist: [
      { tid: 'c1', uin: '7', nickname: 'A', content: '你好' },
      { tid: 'c2', uin: '9', nickname: '自己', content: '自己的' },
    ],
  }]
  const r = scanQzoneComments({ list, seen: [], uin: '9', now })
  assert.equal(r.pending.length, 1)
  assert.equal(r.pending[0].ctid, 'c1')
  assert.equal(r.pending[0].nick, 'A')
  assert.ok(r.seen.includes('p1:c2'))
})

test('已读评论不再入队', () => {
  const list = [{ tid: 'p1', commentlist: [{ tid: 'c1', uin: '7', content: 'x' }] }]
  const r = scanQzoneComments({ list, seen: ['p1:c1'], uin: '9', now })
  assert.equal(r.pending.length, 0)
})

test('楼中楼：父评论已读也扫；清 @ 前缀；超窗口跳过', () => {
  const fresh = { tid: 'r1', uin: '8', name: 'B', content: '@{uin:1,nick:x,who:0,auto:1} 回复内容', create_time: Math.floor(now / 1000) }
  const old = { tid: 'r2', uin: '8', name: 'B', content: '旧', create_time: Math.floor(now / 1000) - 48 * 3600 }
  const list = [{ tid: 'p1', commentlist: [{ tid: 'c1', uin: '7', content: '父', list_3: [fresh, old] }] }]
  const r = scanQzoneComments({ list, seen: ['p1:c1'], uin: '9', now, windowHours: 24 })
  assert.equal(r.pending.length, 1)
  assert.equal(r.pending[0].content, '回复内容')
  assert.equal(r.pending[0].replyUin, '8')
})

test('maxPending 限制', () => {
  const list = [{
    tid: 'p1',
    commentlist: [{ tid: 'c1', uin: '7', content: 'x', list_3: [1, 2, 3, 4, 5].map((i) => ({ tid: 'r' + i, uin: '8', content: 'r' + i })) }],
  }]
  const r = scanQzoneComments({ list, seen: ['p1:c1'], uin: '9', now, maxPending: 2 })
  assert.equal(r.pending.length, 2)
})

test('prompt 包含评论信息与回复指引', () => {
  const text = qzoneCommentPrompt([{ postTid: 'p1', ctid: 'c1', nick: 'A', content: '你好' }])
  assert.match(text, /空间收到了 1 条新评论/)
  assert.match(text, /说说 tid=p1/)
  assert.match(text, /qq_qzone_reply_comment/)
})


test('自己的楼中楼 / 空内容 / 自己的父评论', () => {
  const list = [{
    tid: 'p1',
    commentlist: [
      { tid: 'c1', uin: '9', content: '自己父' },
      { tid: 'c2', uin: '7', content: '父', list_3: [
        { tid: 'r1', uin: '9', name: '自己', content: '自己的回复' },
        { tid: 'r2', uin: '8', name: 'B', content: '@{uin:1,nick:x,who:0,auto:1}   ' },
      ] },
    ],
  }]
  const r = scanQzoneComments({ list, seen: [], uin: '9', now })
  assert.equal(r.pending.length, 1)
  assert.equal(r.pending[0].ctid, 'c2')
  assert.ok(r.seen.includes('p1:c1'))
  assert.ok(r.seen.includes('p1:c2:rr1'))
})

test('maxPending 3 时停止外层继续收集', () => {
  const list = [{
    tid: 'p1',
    commentlist: [
      { tid: 'c1', uin: '7', content: 'a' },
      { tid: 'c2', uin: '7', content: 'b' },
      { tid: 'c3', uin: '7', content: 'c' },
      { tid: 'c4', uin: '7', content: 'd' },
    ],
  }]
  const r = scanQzoneComments({ list, seen: [], uin: '9', now })
  assert.equal(r.pending.length, 3)
})

test('seen 超过 500 条只保留最后 500', () => {
  const seen = Array.from({ length: 600 }, (_, i) => 'old' + i)
  const list = [{ tid: 'p1', commentlist: [{ tid: 'c1', uin: '7', content: '新' }] }]
  const r = scanQzoneComments({ list, seen, uin: '9', now })
  assert.equal(r.seen.length, 500)
  assert.ok(r.seen.includes('p1:c1'))
})
