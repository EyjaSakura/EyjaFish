import test from 'node:test'
import assert from 'node:assert/strict'
import { stripSelfMention, stripSelfMentionAnywhere, isSelfMentionTag } from '../lib/core/mention.js'

const bot = { botQq: '10001', botNames: ['小鲸鱼'] }
const group = (text, atMe = true) => ({ messageType: 'group', atMe, text })
const strip = (message, text) => stripSelfMention({ message, text, ...bot })

test('非群聊或未 @：原样返回', () => {
  assert.equal(strip({ messageType: 'private' }, '@小鲸鱼 hi'), '@小鲸鱼 hi')
  assert.equal(strip(group('@小鲸鱼 hi', false), '@小鲸鱼 hi'), '@小鲸鱼 hi')
})

test('行首机器人 @ + 命令：去掉 @', () => {
  assert.equal(strip(group('@10001 /status'), '@10001 /status'), '/status')
  assert.equal(strip(group('@小鲸鱼 /help'), '@小鲸鱼 /help'), '/help')
})

test('行首 @ + 命令：即使标签不是机器人也去掉 @', () => {
  assert.equal(strip(group('@张三 /status'), '@张三 /status'), '/status')
})

test('行首别人的 @ + 普通文本：保留', () => {
  assert.equal(strip(group('@张三 hello'), '@张三 hello'), '@张三 hello')
})

test('行内/行尾自己的 @ 去掉', () => {
  assert.equal(strip(group('你好 @10001 在吗'), '你好 @10001 在吗'), '你好 在吗')
  assert.equal(strip(group('/status @10001'), '/status @10001'), '/status')
})

test('isSelfMentionTag', () => {
  assert.equal(isSelfMentionTag('10001', '10001', []), true)
  assert.equal(isSelfMentionTag('小鲸鱼(10001)', '10001', []), true)
  assert.equal(isSelfMentionTag('小鲸鱼', '', ['小鲸鱼']), true)
  assert.equal(isSelfMentionTag('张三(10001)', '10001', []), true)
  assert.equal(isSelfMentionTag('张三', '10001', ['小鲸鱼']), false)
})

test('stripSelfMentionAnywhere 收空格', () => {
  assert.equal(stripSelfMentionAnywhere('a  @10001  b', '10001', []), 'a b')
})


test('行首自己的 @ + 普通文本：去掉 @', () => {
  assert.equal(strip(group('@10001 你好'), '@10001 你好'), '你好')
  assert.equal(strip(group('@小鲸鱼 你好'), '@小鲸鱼 你好'), '你好')
})

test('isSelfMentionTag：昵称前缀 / 非自己括号号', () => {
  assert.equal(isSelfMentionTag('小鲸鱼(99999)', '10001', ['小鲸鱼']), true)
  assert.equal(isSelfMentionTag('张三(99999)', '10001', ['小鲸鱼']), false)
})
