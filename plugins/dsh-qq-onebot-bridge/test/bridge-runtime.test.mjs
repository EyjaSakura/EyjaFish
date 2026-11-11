import test from 'node:test'
import assert from 'node:assert/strict'

import { beginMessageTrace } from '../lib/services/trace-runtime.js'
import { rotateChat, rememberForRecall } from '../lib/services/session-command-runtime.js'
import { createRecentRuntime } from '../lib/services/recent-runtime.js'

function recorder() {
  const events = []
  return {
    enabled: true,
    events,
    start: () => 't1',
    now: () => 0,
    event: (e) => events.push(e),
  }
}

test('beginMessageTrace：trace 关闭时返回 null', () => {
  assert.equal(beginMessageTrace({ bridge: { trace: null }, message: {} }), null)
})

test('beginMessageTrace：注入/回放标记写入 trace', () => {
  const trace = recorder()
  const bridge = { trace, chatKeyOf: () => 'u:1', routeOf: () => ({}) }
  const message = { userId: 1, text: 'hi', __injected: true, __replayed: true }
  const handle = beginMessageTrace({ bridge, message })
  assert.equal(handle.id, 't1')
  assert.equal(message.__trace, handle)
  assert.deepEqual(trace.events.map((e) => e.stage), ['inject', 'replay'])
})

test('rotateChat：绑定工作区时只清 sessionId，不丢默认会话', async () => {
  let binding = { sessionId: 'old', title: 'ws' }
  let forgotten = false
  let disposed = false
  const bridge = {
    routeKey: () => 'g:1',
    workspaceBinding: () => binding,
    setWorkspaceBinding: (key, value) => { binding = value },
    clearMemory: () => {},
    disposeSessionByKey: async () => { disposed = true },
    forgetSession: () => { forgotten = true },
  }
  await rotateChat({ bridge, message: {} })
  assert.equal(binding.sessionId, '')
  assert.equal(forgotten, false)
  assert.equal(disposed, true)
})

test('rememberForRecall：只保留 http(s) 图片', () => {
  let saved
  const bridge = {
    chatKeyOf: () => 'u:1',
    routeOf: () => ({}),
    recallCache: { remember: (key, value) => { saved = value } },
  }
  rememberForRecall({
    bridge,
    message: { messageId: 'm', userId: 1, senderName: '', images: [{ url: 'https://x/1.png' }, { url: 'file:///x' }] },
    text: 'hello',
  })
  assert.deepEqual(saved.images, ['https://x/1.png'])
  assert.equal(saved.name, '1')
})

test('createRecentRuntime 必须暴露 rememberText', () => {
  const runtime = createRecentRuntime({ sentMessages: new Map() })
  assert.equal(typeof runtime.rememberText, 'function')
  assert.doesNotThrow(() => runtime.rememberText('m1', 'hello'))
})

test('createRecentRuntime：贴表情关联、最近消息与截断', () => {
  const sentMessages = new Map([['g:1', [{ messageId: 'm1' }]]])
  const runtime = createRecentRuntime({ sentMessages })

  assert.doesNotThrow(() => runtime.stickerMsgLink('m1', '开心'))
  assert.doesNotThrow(() => runtime.linkLastSticker('g:1', '开心'))
  assert.doesNotThrow(() => runtime.linkLastSticker('missing', '开心'))
  assert.doesNotThrow(() => runtime.pushRecentMsg('g:1', 'm1', 'user', '  hello   world  '))

  const block = runtime.recentBlock('g:1')
  assert.match(block, /id=m1 user：\s*hello world/)

  for (let i = 0; i < 10; i++) runtime.pushRecentMsg('g:1', `m${i + 2}`, 'assistant', `msg ${i}`)
  const trimmed = runtime.recentBlock('g:1')
  assert.equal(trimmed.split('\n').length, 7)
  assert.match(trimmed, /m11/)
  assert.equal(runtime.recentBlock('missing'), '')
})
