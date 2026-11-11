import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { handlePrivateFiles } from '../../features/events/private.js'

test('私聊文件：file id → get_file base64 → 保存', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bridge-file-'))
  try {
    const replies = []
    const bridge = {
      config: { fileTransferMaxBytes: 1024 * 1024, allowUsers: [], adminUsers: [] },
      filesDir: dir,
      server: {
        currentSocket: () => null,
        action: async () => ({ base64: Buffer.from('hello').toString('base64') }),
      },
      safeReply: async (_m, text) => replies.push(text),
    }
    await handlePrivateFiles({
      message: { userId: 1, files: [{ name: 'note.txt', file: 'file-id-1' }] },
      bridge,
      debugLog: () => {},
    })
    assert.equal(existsSync(join(dir, 'note.txt')), true)
    assert.equal(readFileSync(join(dir, 'note.txt'), 'utf8'), 'hello')
    assert.match(replies[0], /已保存/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('私聊文件：没有任何下载线索时明确提示', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bridge-file-'))
  try {
    const replies = []
    const bridge = {
      config: { fileTransferMaxBytes: 1024, allowUsers: [], adminUsers: [] },
      filesDir: dir,
      server: { currentSocket: () => null, action: async () => ({}) },
      safeReply: async (_m, text) => replies.push(text),
    }
    await handlePrivateFiles({
      message: { userId: 1, files: [{ name: 'note.txt', file: 'file-id-2' }] },
      bridge,
      debugLog: () => {},
    })
    assert.match(replies[0], /没有可下载链接/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
