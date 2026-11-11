import test from 'node:test'
import assert from 'node:assert/strict'

import { hooks } from '../index.js'
import { handleGroupFiles } from '../group.js'
import { handlePrivateFiles } from '../private.js'

test('events：hooks 暴露私聊文件/视频/群文件/通知', () => {
  assert.deepEqual(Object.keys(hooks).sort(), ['handleGroupFiles', 'handleIncomingVideo', 'handlePrivateFiles', 'onNotice'])
  assert.ok(Object.values(hooks).every((fn) => typeof fn === 'function'))
})

test('events：群文件命令只在群里处理', async () => {
  const bridge = { config: {}, canRun: () => ({ allowed: true }), safeReply: async () => {} }
  assert.equal(await handleGroupFiles({ message: { messageType: 'private' }, text: '/文件', bridge }), false)
})

test('events：群文件关闭时回复并吃掉命令', async () => {
  const replies = []
  const bridge = {
    config: { groupFileEnabled: false },
    canRun: () => ({ allowed: true }),
    safeReply: async (_m, text) => replies.push(text),
  }
  const handled = await handleGroupFiles({
    message: { messageType: 'group', groupId: 1 }, text: '/文件', bridge,
  })
  assert.equal(handled, true)
  assert.match(replies[0], /群文件功能当前关闭/)
})

test('events：私聊文件没有下载链接时给出明确提示', async () => {
  const replies = []
  const bridge = {
    config: { fileTransferMaxBytes: 1024 },
    filesDir: 'D:/tmp/qq-files',
    server: { currentSocket: () => null, action: async () => { throw new Error('不应调用') } },
    safeReply: async (_m, text) => replies.push(text),
  }
  await handlePrivateFiles({
    message: { userId: 1, files: [{ name: 'a.txt', file: '' }] },
    bridge,
  })
  assert.match(replies[0], /没有可下载链接/)
})
