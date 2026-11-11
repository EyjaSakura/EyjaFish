import test from 'node:test'
import assert from 'node:assert/strict'
import { selfStateBlock } from '../lib/services/self-state-block.js'

const NOW = new Date(2026, 0, 1, 12, 0, 0).getTime()
const at = (h, m) => new Date(2026, 0, 1, h, m, 0).getTime()

test('无状态 / 无 activity 返回空', () => {
  assert.equal(selfStateBlock({ chatKey: 'k', readState: () => null, contactLine: () => '', now: NOW }), '')
  assert.equal(selfStateBlock({ chatKey: 'k', readState: () => ({}), contactLine: () => '', now: NOW }), '')
})

test('新鲜状态：活动 + 开始时间 + 同行人', () => {
  const text = selfStateBlock({
    chatKey: 'k',
    readState: () => ({ activity: '写代码', since: at(11, 30), updatedAt: at(11, 50), withWhom: '同事' }),
    contactLine: () => '',
    now: NOW,
  })
  assert.match(text, /你现在正在：写代码/)
  assert.match(text, /11:30 开始，和同事一起/)
})

test('超过 30 分钟视为空闲', () => {
  const text = selfStateBlock({
    chatKey: 'k',
    readState: () => ({ activity: '吃饭', updatedAt: at(10, 0) }),
    contactLine: () => '',
    now: NOW,
  })
  assert.match(text, /刚在吃饭，现在应该空闲了/)
})

test('拼接联系人行并截断 120', () => {
  const text = selfStateBlock({
    chatKey: 'k',
    readState: () => ({ activity: '写代码', updatedAt: NOW }),
    contactLine: () => '对方：小明',
    now: NOW,
  })
  assert.match(text, /对方：小明/)
  assert.ok(text.length <= 120)
})
