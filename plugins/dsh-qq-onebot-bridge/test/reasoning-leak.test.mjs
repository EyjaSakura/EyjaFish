import test from 'node:test'
import assert from 'node:assert/strict'

import { sanitizeAssistantText } from '../lib/services/reasoning-leak.js'

test('reasoning leak：去掉明显英文自我纠错，保留中文正文', () => {
  const input = [
    '算 睡觉也是正经事',
    '我今天也就刷了点视频 捡了几回帽子',
    '[Actually no hat; the hat was in a 说说 I wrote (fictional diary). Careful: don\'t invent own actions as facts?]',
    'Hmm I already sent it. Fine, it\'s my diary world.',
    'Actually I shouldn\'t lie about my day.',
    'I\'ll follow up if needed. No need.',
    'End here.帽子那事是真的 我追了两步就放弃',
    '你呢 除了睡和打 还吃了什么',
  ].join('\n\n')
  const out = sanitizeAssistantText(input)
  assert.match(out, /算 睡觉也是正经事/)
  assert.match(out, /帽子那事是真的/)
  assert.doesNotMatch(out, /Actually/)
  assert.doesNotMatch(out, /Hmm I/)
  assert.doesNotMatch(out, /End here\./)
  assert.doesNotMatch(out, /I wrote|Say that|sent 火花/)
})

test('reasoning leak：正常英文不被误删', () => {
  assert.equal(sanitizeAssistantText('I actually like this movie'), 'I actually like this movie')
})
