import test from 'node:test'
import assert from 'node:assert/strict'
import { openStore, closeStore, addNode, addWindowTurn, recallText } from '../../memory-core/index.mjs'
import { runDaily, closeStaleWindows, pruneStaleNodes } from '../../memory-core/consolidate.mjs'
import { isTrivialMemory } from '../../memory-core/quality.mjs'

function makeDb() {
  const db = openStore(':memory:')
  db.prepare(`INSERT INTO windows(window_id,subject,opened_at,narrative_status)
    VALUES ('w-daily','u:1',?,'pending')`).run(Date.now() - 4 * 60 * 60 * 1000)
  addWindowTurn(db, { windowId: 'w-daily', subject: 'u:1', index: 1, role: 'user', text: '我们决定把语音服务改成就绪时启动', ts: Date.now() - 3 * 60 * 60 * 1000 })
  addWindowTurn(db, { windowId: 'w-daily', subject: 'u:1', index: 1, role: 'assistant', text: '好，按这个做', ts: Date.now() - 3 * 60 * 60 * 1000 + 1000 })
  return db
}

test('daily：关闭旧窗口、生成叙事、可重复执行', async () => {
  const db = makeDb()
  try {
    const first = await runDaily(db, { now: Date.now(), allowLLM: false })
    assert.equal(first.closedWindows, 1)
    assert.equal(first.narratives, 1)
    const win = db.prepare("SELECT narrative_status,closed_at FROM windows WHERE window_id='w-daily'").get()
    assert.equal(win.narrative_status, 'done')
    assert.ok(win.closed_at)
    assert.equal(db.prepare("SELECT COUNT(*) n FROM nodes WHERE type='narrative'").get().n, 1)
    const second = await runDaily(db, { now: Date.now() + 1000, allowLLM: false })
    assert.equal(second.narratives, 0)
    assert.equal(db.prepare("SELECT COUNT(*) n FROM nodes WHERE type='narrative'").get().n, 1)
  } finally {
    closeStore(db)
  }
})

test('daily：只关闭真正过期的窗口', () => {
  const db = makeDb()
  try {
    const closed = closeStaleWindows(db, { now: Date.now(), staleMs: 60 * 60 * 1000 })
    assert.equal(closed, 1)
    assert.equal(closeStaleWindows(db, { now: Date.now(), staleMs: 60 * 60 * 1000 }), 0)
  } finally {
    closeStore(db)
  }
})

test('daily：prune 只归档低价值旧事件', () => {
  const db = openStore(':memory:')
  try {
    const old = Date.now() - 120 * 24 * 60 * 60 * 1000
    addNode(db, { id: 'old-low', type: 'event', subject: 'u:1', description: '旧的低价值事件', importance: 0.1, created_at: old, owner_confirmed: 0 })
    addNode(db, { id: 'new-low', type: 'event', subject: 'u:1', description: '新的低价值事件', importance: 0.1, created_at: Date.now(), owner_confirmed: 0 })
    const count = pruneStaleNodes(db, { now: Date.now() })
    assert.equal(count, 1)
    assert.equal(db.prepare("SELECT status FROM nodes WHERE id='old-low'").get().status, 'archived')
    assert.equal(db.prepare("SELECT status FROM nodes WHERE id='new-low'").get().status, 'active')
  } finally {
    closeStore(db)
  }
})

test('quality：回执和填充词不进入记忆', () => {
  assert.equal(isTrivialMemory('好嘞'), true)
  assert.equal(isTrivialMemory('用户表示理解了之前关于三国的讨论'), true)
  assert.equal(isTrivialMemory('今天去了沙面岛'), false)
})

test('recall：on 头部与 900 字预算', () => {
  const db = openStore(':memory:')
  try {
    addNode(db, { id: 'r1', type: 'event', subject: 'u:1', description: '端口 6700 配置', owner_confirmed: 1 })
    const text = recallText(db, { subject: 'u:1', query: '端口 6700', mode: 'on', budgetChars: 120 })
    assert.match(text, /^【记忆】/)
    assert.ok(text.length <= 120)
    const shadow = recallText(db, { subject: 'u:1', query: '端口 6700', mode: 'shadow', budgetChars: 120 })
    assert.match(shadow, /stage2 shadow/)
  } finally { closeStore(db) }
})
