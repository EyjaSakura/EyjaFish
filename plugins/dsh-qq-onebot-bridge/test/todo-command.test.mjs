import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { handleTodo } from '../lib/services/todo-command.js'

function harness() {
  const replies = []
  const todoDir = mkdtempSync(join(tmpdir(), 'todo-cmd-'))
  return {
    replies,
    call: (arg) => handleTodo({
      message: {}, arg, todoDir, routeKey: 'g:9',
      safeReply: async (_m, t) => replies.push(t),
    }),
  }
}

test('空清单 / 添加 / 查看', async () => {
  const h = harness()
  await h.call('')
  assert.match(h.replies[0], /空的/)
  await h.call('add 修 bug')
  assert.match(h.replies[1], /已添加/)
  await h.call('list')
  assert.match(h.replies[2], /修 bug/)
  assert.match(h.replies[2], /1 件待完成/)
})

test('add 空内容提示用法', async () => {
  const h = harness()
  await h.call('add   ')
  assert.match(h.replies[0], /用法/)
})

test('done：无效序号 / 成功 / 全部完成', async () => {
  const h = harness()
  await h.call('add a')
  await h.call('add b')
  await h.call('done 9')
  assert.match(h.replies[2], /序号无效/)
  await h.call('done 1')
  assert.match(h.replies[3], /已完成：a/)
  await h.call('done 1')
  assert.match(h.replies[4], /已完成：b/)
  await h.call('')
  assert.match(h.replies[5], /全部完成/)
})

test('clear 清除已完成', async () => {
  const h = harness()
  await h.call('add a')
  await h.call('done 1')
  await h.call('clear')
  assert.match(h.replies[2], /已清除/)
  await h.call('')
  assert.match(h.replies[3], /空的/)
})

test('未知子命令给用法', async () => {
  const h = harness()
  await h.call('wat')
  assert.match(h.replies[0], /用法/)
})
