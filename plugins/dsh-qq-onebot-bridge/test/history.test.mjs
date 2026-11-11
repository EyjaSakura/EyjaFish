import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeHistoryMessages, formatHistoryLines } from '../lib/history.js'

const msg = (id, userId, name, text, time = 1760000000) => ({
  message_id: id,
  time,
  sender: { user_id: userId, nickname: name },
  message: [{ type: 'text', data: { text } }],
})

test('normalize：非数组 / 坏项 / limit', () => {
  assert.equal(normalizeHistoryMessages(null).reason, '载荷为空或不是消息列表')
  const r = normalizeHistoryMessages([msg(1, 5, 'A', '你好'), null, 42, msg(2, 6, 'B', '世界')], { limit: 10 })
  assert.equal(r.messages.length, 2)
  assert.equal(r.dropped, 2)
  assert.match(r.messages[0].text, /你好/)

  const limited = normalizeHistoryMessages([msg(1, 1, 'A', 'a'), msg(2, 2, 'B', 'b')], { limit: 1 })
  assert.equal(limited.messages.length, 1)
})

test('format：排序、自己标记、未知用户', () => {
  const messages = [
    { time: 1760000100, userId: 10001, name: '我', text: '后' },
    { time: 1760000000, userId: 5, name: '', text: '前' },
  ]
  const out = formatHistoryLines(messages, { selfId: 10001, limit: 10 })
  assert.match(out.text, /前/)
  assert.match(out.text, /我（我）: 后/)
  assert.match(out.text, /未知用户/)
  assert.equal(out.used, 2)
  assert.equal(out.total, 2)
})

test('format：超 limit 保留最近，标题带 total', () => {
  const messages = Array.from({ length: 5 }, (_, i) => ({ time: 1760000000 + i, userId: 1, name: 'A', text: 'm' + i }))
  const out = formatHistoryLines(messages, { limit: 2 })
  assert.equal(out.used, 2)
  assert.equal(out.truncated, true)
  assert.match(out.text, /显示最近 2 条/)
  assert.doesNotMatch(out.text, /m0/)
})

test('format：空文本跳过、超字符截断、非法输入', () => {
  const skipped = formatHistoryLines([{ time: 1, userId: 1, name: 'A', text: '' }, null], {})
  assert.equal(skipped.used, 0)
  assert.match(skipped.text, /共 2 条/)

  const long = formatHistoryLines([{ time: 1, userId: 1, name: 'A', text: 'x'.repeat(50) }], { maxChars: 10 })
  assert.equal(long.truncated, true)

  assert.deepEqual(formatHistoryLines(null), { text: '', used: 0, total: 0, truncated: false, chars: 0 })
})
