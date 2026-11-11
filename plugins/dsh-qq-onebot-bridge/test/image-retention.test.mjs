import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cleanupImageDirs, pruneTrashDirs } from '../lib/services/image-retention.js'
import { pruneTrash } from '../lib/services/trash-prune.js'

test('cleanup：移入回收站计数', () => {
  const moved = []
  const r = cleanupImageDirs({
    config: { imageRetentionDays: 7 },
    dirs: ['a', 'b'],
    pathOf: () => 'D:/trash',
    expiredFiles: (dir) => (dir === 'a' ? ['x', 'y'] : []),
    moveToTrash: (file, trash) => { moved.push([file, trash]); return true },
  })
  assert.equal(r.moved, 2)
  assert.deepEqual(moved, [['x', 'D:/trash'], ['y', 'D:/trash']])
})

test('cleanup：移动失败保留原文件', () => {
  const logs = []
  const r = cleanupImageDirs({
    config: {},
    dirs: ['a'],
    pathOf: () => 'D:/trash',
    expiredFiles: () => ['x'],
    moveToTrash: () => false,
    debugLog: (m) => logs.push(m),
  })
  assert.equal(r.moved, 0)
  assert.match(logs[0], /无法移入回收目录/)
})

test('cleanup：回收站关闭时不移动', () => {
  let called = 0
  const r = cleanupImageDirs({
    config: { imageTrashEnabled: false },
    dirs: ['a'],
    pathOf: () => 'D:/trash',
    expiredFiles: () => ['x'],
    moveToTrash: () => { called += 1; return true },
  })
  assert.equal(r.moved, 0)
  assert.equal(called, 0)
})

test('cleanup：异常返回 0', () => {
  const r = cleanupImageDirs({
    config: {},
    dirs: ['a'],
    pathOf: () => 'D:/trash',
    expiredFiles: () => { throw new Error('io') },
    moveToTrash: () => true,
  })
  assert.deepEqual(r, { moved: 0 })
})

test('prune：真删后 trace，异常归零', () => {
  const events = []
  const r = pruneTrashDirs({
    config: {},
    pathOf: () => 'D:/trash',
    pruneTrash: () => ({ buckets: 2, files: 3, bytes: 2048 }),
    trace: { event: (e) => events.push(e) },
  })
  assert.equal(r.files, 3)
  assert.equal(events[0].stage, 'archive')

  const bad = pruneTrashDirs({
    config: {},
    pathOf: () => 'D:/trash',
    pruneTrash: () => { throw new Error('x') },
  })
  assert.deepEqual(bad, { buckets: 0, files: 0, bytes: 0 })
})

test('prune：实际 fs 删除过期日期桶（回归）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qq-trash-prune-'))
  try {
    const bucket = join(dir, '2020-01-01')
    mkdirSync(bucket, { recursive: true })
    writeFileSync(join(bucket, 'old.bin'), 'x')
    const result = pruneTrashDirs({
      config: { imageTrashDir: dir, trashRetentionDays: 1, trashMaxBytes: 0 },
      pathOf: () => dir,
      pruneTrash,
      trace: { event: () => {} },
      debugLog: () => {},
    })
    assert.equal(result.buckets, 1)
    assert.equal(result.files, 1)
    assert.equal(existsSync(bucket), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
