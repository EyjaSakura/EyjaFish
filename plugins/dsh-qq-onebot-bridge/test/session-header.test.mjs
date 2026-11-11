import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import zlib from 'node:zlib'
import { readHeaderAt } from '../lib/services/session-header.js'

function deps(dir) {
  return {
    dir,
    readdir: readdirSync,
    join,
    readFile: readFileSync,
    zstdDecompressSync: zlib.zstdDecompressSync,
    debugLog: () => {},
  }
}

test('读取 zstd 首帧 header', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hdr-'))
  const payload = Buffer.from(JSON.stringify({ parentSession: 'p1' }) + '\n')
  writeFileSync(join(dir, 'session.abc.jsonl.zstd'), zlib.zstdCompressSync(payload))
  assert.deepEqual(readHeaderAt(deps(dir)), { parentSession: 'p1' })
})

test('没有 zstd 文件 / 目录不存在', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hdr-'))
  writeFileSync(join(dir, 'session.lock'), 'x')
  assert.equal(readHeaderAt(deps(dir)), undefined)
  assert.equal(readHeaderAt(deps(join(dir, 'missing'))), undefined)
})

test('损坏文件只记日志', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hdr-'))
  writeFileSync(join(dir, 'session.bad.jsonl.zstd'), 'not-zstd')
  const logs = []
  const d = deps(dir)
  d.debugLog = (m) => logs.push(m)
  assert.equal(readHeaderAt(d), undefined)
  assert.match(logs[0], /cannot read header/)
})
