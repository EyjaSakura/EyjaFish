import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createSessionTurnsStore } from '../lib/services/session-turns.js'

function store(opts = {}) {
  const file = join(mkdtempSync(join(tmpdir(), 'dsh-turns-')), 'turns.json')
  return { file, s: createSessionTurnsStore({ file, now: () => 1000, ...opts }) }
}

test('累计回合，到阈值轮换', () => {
  const { s } = store()
  assert.equal(s.count({ key: 'u:1', sessionId: 's1', max: 3 }).rotate, false)
  assert.equal(s.count({ key: 'u:1', sessionId: 's1', max: 3 }).rotate, false)
  const r = s.count({ key: 'u:1', sessionId: 's1', max: 3 })
  assert.equal(r.rotate, true)
  assert.equal(r.oldId, 's1')
  assert.equal(s.read()['u:1'].turns, 0)
})

test('回合进行中不轮换', () => {
  const { s } = store()
  s.count({ key: 'u:1', sessionId: 's1', max: 2 })
  const r = s.count({ key: 'u:1', sessionId: 's1', max: 2, turnActive: true })
  assert.equal(r.rotate, false)
  assert.equal(r.turns, 2)
})

test('换会话后重新计数', () => {
  const { s } = store()
  s.count({ key: 'u:1', sessionId: 's1', max: 10 })
  s.count({ key: 'u:1', sessionId: 's1', max: 10 })
  const r = s.count({ key: 'u:1', sessionId: 's2', max: 10 })
  assert.equal(r.turns, 1)
})

test('reset 清空', () => {
  const { s } = store()
  s.count({ key: 'u:1', sessionId: 's1', max: 10 })
  s.reset('u:1')
  assert.equal(s.read()['u:1'].turns, 0)
  assert.equal(s.read()['u:1'].sessionId, '')
})

test('文件损坏时恢复为空', () => {
  const { file, s } = store()
  writeFileSync(file, 'not json')
  assert.deepEqual(s.read(), {})
  assert.equal(s.count({ key: 'u:1', max: 2 }).turns, 1)
})
