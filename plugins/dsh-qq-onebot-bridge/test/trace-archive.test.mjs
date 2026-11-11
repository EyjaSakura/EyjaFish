import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { TraceRecorder, beginTrace, newTraceId } from '../lib/trace.js'
import { archiveLine, parseArchiveLine, HistoryArchive } from '../lib/archive.js'

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'bridge-trace-'))
}

test('trace：start / event / step / 查询 / 汇总', async () => {
  const dir = tempDir()
  try {
    const rec = new TraceRecorder({ file: join(dir, 'trace.jsonl'), memoryLimit: 20 })
    const id = rec.start({ chatKey: 'g:1', userId: 2, text: 'hi' })
    assert.match(id, /^t-/)
    rec.event({ id, stage: 'command', ok: false, reason: 'denied' })
    await rec.step(id, 'agent', async () => 'ok')
    await assert.rejects(rec.step(id, 'agent', async () => { throw new Error('boom') }), /boom/)
    assert.ok(rec.get(id).length >= 4)
    assert.equal(rec.recent({ chatKey: 'g:1', limit: 2 }).length >= 1, true)
    assert.equal(rec.recent({ ok: false }).length >= 1, true)
    const summary = rec.summary()
    assert.equal(summary.total >= 4, true)
    assert.equal(summary.traces, 1)
    assert.equal(rec.listTraces({ limit: 1 }).length, 1)
    assert.ok(readFileSync(join(dir, 'trace.jsonl'), 'utf8').includes('"stage":"command"'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('trace：beginTrace / 关闭 / 不可序列化 data', async () => {
  const id = newTraceId(1)
  assert.match(id, /^t-/)
  const rec = new TraceRecorder({ enabled: true })
  const handle = beginTrace(rec, { chatKey: 'u:1' })
  handle.mark('inbound')
  await handle.step('reply', async () => 1)
  assert.ok(handle.events().length >= 2)
  const circular = {}
  circular.self = circular
  rec.event({ id: handle.id, data: circular })
  assert.equal(rec.get(handle.id).length >= 3, true)
  rec.setEnabled(false)
  assert.equal(rec.event({ id: handle.id }), null)
})

test('archive：单行序列化 / 解析 / 坏行', () => {
  const line = archiveLine({ ts: 1, chatKey: 'g:1', userId: 2, name: '甲', kind: 'text', text: ' a\n b ' })
  assert.equal(line.includes('\n'), false)
  const parsed = parseArchiveLine(line)
  assert.equal(parsed.chatKey, 'g:1')
  assert.equal(parsed.text, 'a b')
  assert.equal(parseArchiveLine('bad'), null)
  assert.equal(parseArchiveLine('[]'), null)
  assert.equal(parseArchiveLine('{}'), null)
  assert.equal(parseArchiveLine(1), null)
})

test('archive：追加 / 检索 / 统计 / 清理', () => {
  const dir = tempDir()
  try {
    const archive = new HistoryArchive({ dir, keepDays: 90 })
    assert.equal(archive.append({ ts: Date.now(), chatKey: 'g:1', userId: 1, name: '甲', text: 'hello' }), true)
    assert.equal(archive.append({ ts: Date.now(), chatKey: 'g:1', userId: 2, name: '乙', text: 'world' }), true)
    const found = archive.search('hello', { days: 1 })
    assert.equal(found.hits.length, 1)
    assert.equal(found.hits[0].name, '甲')
    assert.equal(archive.search('', {}).hits.length, 0)
    const stats = archive.stats()
    assert.equal(stats.files >= 1, true)
    assert.equal(typeof stats.bytes, 'number')
    const pruned = archive.prune()
    assert.equal(typeof pruned.kept, 'number')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
