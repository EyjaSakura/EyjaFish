import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { rmSync, readdirSync, statSync } from 'node:fs'
import { pruneTrash } from '../lib/services/trash-prune.js'

const fs = { exists: existsSync, readdir: readdirSync, stat: statSync, rm: rmSync }

function bucket(root, name, files = 1, bytes = 10) {
  const d = join(root, name)
  mkdirSync(d, { recursive: true })
  for (let i = 0; i < files; i += 1) writeFileSync(join(d, `f${i}.txt`), 'x'.repeat(bytes))
  return d
}

test('目录不存在返回 0', () => {
  assert.deepEqual(pruneTrash({ dir: 'D:\\no\\such', ...fs }), { buckets: 0, files: 0, bytes: 0 })
})

test('按 keepDays 删除过期桶，保留新桶', () => {
  const root = mkdtempSync(join(tmpdir(), 'trash-'))
  const old = bucket(root, '2020-01-01', 2, 10)
  const recent = bucket(root, '2026-11-01', 1, 10)
  const r = pruneTrash({ dir: root, keepDays: 30, now: Date.parse('2026-11-08T00:00:00Z'), ...fs })
  assert.equal(r.buckets, 1)
  assert.equal(r.files, 2)
  assert.equal(existsSync(old), false)
  assert.equal(existsSync(recent), true)
})

test('按 maxBytes 淘汰最老桶', () => {
  const root = mkdtempSync(join(tmpdir(), 'trash-'))
  const a = bucket(root, '2026-11-01', 1, 100)
  const b = bucket(root, '2026-11-02', 1, 100)
  const r = pruneTrash({ dir: root, keepDays: 9999, maxBytes: 150, now: Date.parse('2026-11-08T00:00:00Z'), ...fs })
  assert.equal(r.buckets, 1)
  assert.equal(existsSync(a), false)
  assert.equal(existsSync(b), true)
})

test('非法目录名忽略', () => {
  const root = mkdtempSync(join(tmpdir(), 'trash-'))
  bucket(root, 'not-a-date', 1, 10)
  const r = pruneTrash({ dir: root, keepDays: 1, now: Date.parse('2026-11-08T00:00:00Z'), ...fs })
  assert.equal(r.buckets, 0)
})
