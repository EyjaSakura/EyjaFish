import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { CheckinStore, isCheckinIntent, isCheckinBoardIntent } from '../lib/checkin.js'
import { parseVoteCommand, TodoStore } from '../lib/grouptools.js'

test('isCheckinIntent', () => {
  assert.equal(isCheckinIntent('签到'), true)
  assert.equal(isCheckinIntent(' 签到！ '), true)
  assert.equal(isCheckinIntent('签到!'), true)
  assert.equal(isCheckinIntent('签到。'), true)
  assert.equal(isCheckinIntent('我要签到'), false)
  assert.equal(isCheckinIntent(''), false)
  assert.equal(isCheckinIntent('打卡', '打卡'), true)
})

test('isCheckinBoardIntent', () => {
  for (const t of ['签到榜', '签到排行', '/签到榜']) assert.equal(isCheckinBoardIntent(t), true)
  assert.equal(isCheckinBoardIntent('/签到'), false)
})

test('CheckinStore：首次 / 同日 / 连续 / 榜单', () => {
  const dir = mkdtempSync(join(tmpdir(), 'checkin-'))
  const store = new CheckinStore(dir)
  assert.deepEqual(store.checkin('g:1', 2, 'A'), { firstToday: true, streak: 1, total: 1 })
  assert.deepEqual(store.checkin('g:1', 2, 'A'), { firstToday: false, streak: 1, total: 1 })

  const file = join(dir, 'g_1.json')
  const data = JSON.parse(readFileSync(file, 'utf8'))
  data['2'].last = CheckinStore.yesterday()
  writeFileSync(file, JSON.stringify(data), 'utf8')
  assert.deepEqual(store.checkin('g:1', 2, 'A'), { firstToday: true, streak: 2, total: 2 })

  const board = store.board('g:1', 10)
  assert.equal(board[0].today, true)
  assert.equal(board[0].streak, 2)
})

test('parseVoteCommand', () => {
  assert.equal(parseVoteCommand('/vote-end'), null)
  assert.equal(parseVoteCommand('随便'), null)
  const v = parseVoteCommand('投票：今晚吃什么？A 火锅 B 烧烤')
  assert.equal(v.question, '今晚吃什么')
  assert.deepEqual(v.options, [{ key: 'A', label: '火锅' }, { key: 'B', label: '烧烤' }])
  const bare = parseVoteCommand('投票：去不去')
  assert.deepEqual(bare.options.map((o) => o.label), ['赞成', '反对'])
})

test('TodoStore：读写与坏文件', () => {
  const dir = mkdtempSync(join(tmpdir(), 'todo-'))
  const store = new TodoStore(dir)
  assert.deepEqual(store.load('g:1'), [])
  store.save('g:1', [{ text: '修 bug' }])
  assert.deepEqual(store.load('g:1'), [{ text: '修 bug' }])
  writeFileSync(join(dir, 'g_1.json'), 'not json')
  assert.deepEqual(store.load('g:1'), [])
})
