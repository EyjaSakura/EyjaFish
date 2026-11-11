import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeForwardNodes, isForwardPayload, formatForwardTranscript } from '../lib/forward.js'

const node = (name, text, time = 1760000000) => ({
  type: 'node',
  data: { name, uin: '123', time, content: [{ type: 'text', data: { text } }] },
})

test('normalize：v11 节点 + 字符串 + 坏项', () => {
  const r = normalizeForwardNodes({ messages: [node('A', '你好'), '纯文本', null, 42] })
  assert.equal(r.nodes.length, 2)
  assert.equal(r.nodes[0].name, 'A')
  assert.match(r.nodes[0].text, /你好/)
  assert.match(r.nodes[1].text, /纯文本/)
})

test('normalize：Go-CQHTTP message 形状 + at/file/未知段', () => {
  const r = normalizeForwardNodes({
    message: [{
      sender: { nickname: 'B', user_id: 7 },
      message: [
        { type: 'text', data: { text: '看' } },
        { type: 'at', data: { qq: '5' } },
        { type: 'file', data: { name: 'a.txt' } },
        { type: 'poke', data: {} },
      ],
    }],
  })
  assert.equal(r.nodes.length, 1)
  assert.match(r.nodes[0].text, /看/)
  assert.match(r.nodes[0].text, /@5/)
  assert.match(r.nodes[0].text, /\[文件 a\.txt\]/)
})

test('isForwardPayload', () => {
  assert.equal(isForwardPayload({ messages: [node('A', 'x')] }), true)
  assert.equal(isForwardPayload({ messages: [] }), false)
  assert.equal(isForwardPayload({}), false)
})

test('formatForwardTranscript：标题、时间、截断', () => {
  const { nodes } = normalizeForwardNodes({ messages: [node('A', '你好'), node('B', '世界')] })
  const out = formatForwardTranscript(nodes, { maxNodes: 10, maxChars: 100 })
  assert.match(out.text, /转发聊天记录/)
  assert.match(out.text, /A/)
  assert.match(out.text, /你好/)
  assert.equal(out.used, 2)

  const truncated = formatForwardTranscript(nodes, { maxNodes: 1, maxChars: 100 })
  assert.equal(truncated.truncated, true)
  assert.match(truncated.text, /显示前 1 条/)
})


test('normalize：裸数组 / data 包裹 / 无法识别对象', () => {
  const bare = normalizeForwardNodes([node('A', 'x')])
  assert.equal(bare.nodes.length, 1)
  const wrapped = normalizeForwardNodes({ messages: [node('B', 'y')] })
  assert.equal(wrapped.nodes.length, 1)
  const bad = normalizeForwardNodes({ messages: [{ foo: 1 }, { bar: 2 }] })
  assert.equal(bad.nodes.length, 0)
})

test('normalize：at 无名字 / file 无名字 / 未知段', () => {
  const r = normalizeForwardNodes({ messages: [{
    sender: { user_id: 1 },
    message: [
      { type: 'at', data: { qq: '123' } },
      { type: 'file', data: {} },
      { type: 'unknown', data: {} },
    ],
  }] })
  assert.match(r.nodes[0].text, /@123/)
  assert.match(r.nodes[0].text, /\[文件\]/)
})

test('format：maxChars 截断与空节点', () => {
  const { nodes } = normalizeForwardNodes({ messages: [node('A', 'x'.repeat(200))] })
  const out = formatForwardTranscript(nodes, { maxNodes: 10, maxChars: 20 })
  assert.equal(out.truncated, true)
  assert.match(out.text, /截断/)
  assert.equal(formatForwardTranscript([], {}).used, 0)
})
