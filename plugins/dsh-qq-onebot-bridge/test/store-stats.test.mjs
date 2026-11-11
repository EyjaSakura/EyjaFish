import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { dayKey, StatsStore, pickReportTargets, formatActivity, formatHonor } from '../lib/stats.js'
import { readJson, writeJsonAtomic, appendCappedLine, moveToTrash, expiredFiles, JsonStore } from '../lib/store.js'

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'bridge-store-'))
}

test('stats：日期 / 计数 / 榜单 / 文案', () => {
  assert.equal(dayKey(new Date(2026, 0, 2)), '2026-01-02')
  const dir = tempDir()
  try {
    const store = new StatsStore(dir, { keepDays: 2 })
    const now = new Date(2026, 0, 2).getTime()
    assert.equal(store.record('g:1', 1, '甲', now), 1)
    assert.equal(store.record('g:1', 1, '甲', now), 2)
    assert.equal(store.record('g:1', 2, '乙', now), 1)
    assert.equal(store.total('g:1', now), 3)
    assert.deepEqual(store.top('g:1', { days: 1, now }), [
      { userId: '1', name: '甲', count: 2 },
      { userId: '2', name: '乙', count: 1 },
    ])
    assert.ok(store.dayList('g:1').includes('2026-01-02'))
    assert.match(formatActivity(store.top('g:1', { now })), /甲 2 条/)
    assert.match(formatActivity([]), /还没有统计/)
    assert.match(formatHonor({ current_talkative: [{ name: '甲' }] }, { groupName: '群' }), /龙王：甲/)
    assert.match(formatHonor(null), /暂时拿不到/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('stats：日报目标归一化', () => {
  assert.deepEqual(pickReportTargets({ configured: ['1', 'g:2'] }), ['g:1', 'g:2'])
  assert.deepEqual(pickReportTargets({ optIn: ['3'] }), ['g:3'])
  assert.deepEqual(pickReportTargets({ allowGroups: ['4'] }), ['g:4'])
  assert.deepEqual(pickReportTargets({}), [])
})

test('store：读写 / 追加 / 回收站 / 过期', () => {
  const dir = tempDir()
  try {
    const file = join(dir, 'state.json')
    assert.equal(readJson(file, 'fallback'), 'fallback')
    assert.equal(writeJsonAtomic(file, { a: 1 }), true)
    assert.deepEqual(readJson(file, null), { a: 1 })
    writeFileSync(file, '{bad', 'utf8')
    assert.equal(readJson(file, 'bad'), 'bad')

    const log = join(dir, 'log.txt')
    assert.equal(appendCappedLine(log, 'one'), true)
    assert.equal(appendCappedLine(log, 'two'), true)
    assert.match(readFileSync(log, 'utf8'), /one\ntwo\n/)

    const victim = join(dir, 'victim.txt')
    writeFileSync(victim, 'x', 'utf8')
    const trashed = moveToTrash(victim, join(dir, 'trash'), { now: new Date(2026, 0, 2) })
    assert.match(trashed, /trash[\\/]2026-01-02[\\/]victim.txt/)
    assert.equal(moveToTrash('', join(dir, 'trash')), '')

    const rows = expiredFiles('unused', 1000, 10_000, {
      readdir: () => ['old', 'new', 'dir'],
      stat: (p) => ({ isFile: () => p.endsWith('old') || p.endsWith('new'), mtimeMs: p.endsWith('old') ? 1000 : 9000 }),
    })
    assert.equal(rows.length, 1)
    assert.match(rows[0], /old$/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('store：JsonStore 读 / 写 / mutate / clear', () => {
  const dir = tempDir()
  try {
    const file = join(dir, 'doc.json')
    const store = new JsonStore(file, { fallback: { n: 0 } })
    assert.deepEqual(store.read(), { n: 0 })
    assert.equal(store.mutate((d) => { d.n += 1; return d.n }), 1)
    assert.deepEqual(store.read(), { n: 1 })
    store.clear()
    assert.deepEqual(store.read(), { n: 0 })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
