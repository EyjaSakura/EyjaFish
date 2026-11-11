import test from 'node:test'
import assert from 'node:assert/strict'
import { formatWorkspaceList, workspaceSessionBusy } from '../lib/services/workspace-list.js'

test('formatWorkspaceList：当前 / 最新 / 空会话', () => {
  const text = formatWorkspaceList({
    key: 'u:1',
    list: [{ path: 'D:/a', title: 'A' }, { path: 'D:/b', title: 'B' }],
    binding: { path: 'D:/a' },
    sessionsOf: (ws) => (ws.path === 'D:/a' ? [{ id: '123456789' }] : []),
  })
  assert.match(text, /1\. A ←当前（1 条会话，最新 12345678）/)
  assert.match(text, /2\. B（0 条会话）/)
  assert.match(text, /\/ws <序号或名字>/)
})

test('busy：空目录 / 无锁直接 false', async () => {
  assert.equal(await workspaceSessionBusy({ dir: '', exists: () => true }), false)
  assert.equal(await workspaceSessionBusy({ dir: 'D:/x', exists: () => false }), false)
})

test('busy：flock 成功 = false', async () => {
  const r = await workspaceSessionBusy({
    dir: 'D:/x', exists: () => true,
    run: (cmd, args, opts, cb) => cb(null),
  })
  assert.equal(r, false)
})

test('busy：exit 9 = true，其他错误 = false', async () => {
  const busy = await workspaceSessionBusy({
    dir: 'D:/x', exists: () => true,
    run: (cmd, args, opts, cb) => cb({ code: 9, message: 'exit code 9' }),
  })
  assert.equal(busy, true)
  const other = await workspaceSessionBusy({
    dir: 'D:/x', exists: () => true,
    run: (cmd, args, opts, cb) => cb({ code: 1, message: 'enoent' }),
  })
  assert.equal(other, false)
})
