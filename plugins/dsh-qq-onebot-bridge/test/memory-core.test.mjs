import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  openStore, closeStore, addNode, addWindowTurn, setDecision, count,
  searchCandidates, listPending, confirmNode, ingestTurn, migrateLegacy, buildTokens, rankCandidates,
} from '../../memory-core/index.mjs'

function memoryDb() {
  const db = openStore(':memory:')
  return db
}

test('memory-core：双索引包含单字', () => {
  const tokens = buildTokens('今天好累')
  assert.ok(tokens.includes('今天'))
  assert.ok(tokens.includes('好累'))
  assert.ok(tokens.split(' ').includes('累'))
  assert.equal(buildTokens(null), '')
  assert.equal(buildTokens(undefined), '')
  assert.equal(buildTokens(''), '')
})

test('memory-core：raw_quote=null 可写入，FTS 单字与实体可召回', () => {
  const db = memoryDb()
  try {
    addNode(db, {
      id: 'n1', type: 'event', subject: 'u:1',
      description: '今天好累', raw_quote: null,
      entities: ['person:qianqian'], owner_confirmed: 1,
    })
    assert.equal(count(db, 'nodes'), 1)
    const fts = searchCandidates(db, '累', { subject: 'u:1' })
    assert.ok(fts.some((row) => row.id === 'n1'))
    addNode(db, {
      id: 'n2', type: 'event', subject: 'u:1',
      description: '倩倩姐最近压力大', entities: ['person:qianqian'], owner_confirmed: 1,
    })
    const entity = searchCandidates(db, '倩倩姐', { subject: 'u:1' })
    assert.ok(entity.some((row) => row.id === 'n2'))
  } finally {
    closeStore(db)
  }
})

test('memory-core：window_turns 幂等，队列去重', () => {
  const db = memoryDb()
  try {
    addWindowTurn(db, { windowId: 'w1', subject: 'u:1', index: 1, role: 'user', text: 'a', ts: 1 })
    addWindowTurn(db, { windowId: 'w1', subject: 'u:1', index: 1, role: 'user', text: 'a2', ts: 2 })
    assert.equal(count(db, 'window_turns'), 1)
    setDecision(db, { windowId: 'w1', index: 1, decision: 'extract' })
    assert.equal(count(db, 'turn_decisions'), 1)
  } finally {
    closeStore(db)
  }
})

test('memory-core：ingestTurn 写入 window_turns 并幂等去重', () => {
  const db = memoryDb()
  try {
    const payload = {
      subject: 'u:1', windowId: 'w1', traceId: 't1',
      turns: [
        { index: 1, role: 'user', text: '记住我喜欢吃白饭', ts: 100 },
        { index: 1, role: 'assistant', text: '好', ts: 101 },
      ],
    }
    const first = ingestTurn(db, payload)
    const second = ingestTurn(db, payload)
    assert.equal(first.accepted, true)
    assert.equal(second.accepted, true)
    assert.equal(count(db, 'window_turns'), 2)
    assert.equal(count(db, 'nodes'), 2) // event + prefers 白饭
  } finally {
    closeStore(db)
  }
})

test('memory-core：stage2 排序方向正确，实体可召回', () => {
  const db = memoryDb()
  try {
    addNode(db, { id: 'A', type: 'event', subject: 'u:1', description: '端口 6700 配置', entities: ['port:6700'], owner_confirmed: 1 })
    addNode(db, { id: 'B', type: 'event', subject: 'u:1', description: '端口 6700 附近的说明', owner_confirmed: 1 })
    addNode(db, { id: 'C', type: 'event', subject: 'u:1', description: '今天天气不错', owner_confirmed: 1 })
    addNode(db, { id: 'D', type: 'event', subject: 'u:1', description: '倩倩姐最近压力大', entities: ['person:倩倩姐'], owner_confirmed: 1 })
    const ranked = rankCandidates(db, { subject: 'u:1', query: '端口 6700', limit: 3 })
    assert.equal(ranked[0].id, 'A')
    const entity = rankCandidates(db, { subject: 'u:1', query: '倩倩姐', limit: 3 })
    assert.ok(entity.some((x) => x.id === 'D'))
  } finally {
    closeStore(db)
  }
})

test('memory-core：低风险 fact 自动 supersede，可回滚链', () => {
  const db = memoryDb()
  try {
    addNode(db, { id: 'port-1', type: 'fact', subject: 'misc.port', predicate: 'port', description: '端口 6700', owner_confirmed: 1 })
    addNode(db, { id: 'port-2', type: 'fact', subject: 'misc.port', predicate: 'port', description: '端口 6701', owner_confirmed: 1 })
    const old = db.prepare("SELECT status,superseded_by FROM nodes WHERE id='port-1'").get()
    const next = db.prepare("SELECT status,supersedes_json FROM nodes WHERE id='port-2'").get()
    assert.equal(old.status, 'superseded')
    assert.equal(old.superseded_by, 'port-2')
    assert.equal(next.status, 'active')
    assert.match(next.supersedes_json, /port-1/)
  } finally {
    closeStore(db)
  }
})

test('memory-core：pending 事实可确认/拒绝', () => {
  const db = memoryDb()
  try {
    addNode(db, {
      id: 'pending-1', type: 'fact', subject: 'person.owner.profile',
      predicate: 'identity.role', description: '主人是管理员',
      status: 'pending', owner_confirmed: 0,
    })
    assert.equal(listPending(db).length, 1)
    assert.equal(confirmNode(db, 'pending-1', true).ok, true)
    assert.equal(listPending(db).length, 0)
  } finally {
    closeStore(db)
  }
})

test('memory-core：迁移 facts.json 并保留 pending 语义', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memory-migrate-'))
  try {
    const facts = join(dir, 'facts.json')
    const events = join(dir, 'events.jsonl')
    writeFileSync(facts, JSON.stringify({ facts: [
      { id: 'f1', subject: 'person.owner.profile', claim: '主人是管理员', confidence: 0.9, recorded_at: 1 },
    ] }), 'utf8')
    writeFileSync(events, JSON.stringify({ id: 'e1', who: 'u:1', project: 'misc', kind: 'event', title: '测试事件', at: 2 }) + '\n', 'utf8')
    const db = memoryDb()
    try {
      const result = migrateLegacy(db, { factsFile: facts, eventsFile: events })
      assert.equal(result.inserted, 2)
      assert.equal(count(db, 'nodes'), 2)
      const pending = db.prepare("SELECT owner_confirmed FROM nodes WHERE id='legacy-f1'").get()
      assert.equal(pending.owner_confirmed, 0)
    } finally {
      closeStore(db)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
