// Deterministic stage-2 probes for the shadow window. No model calls.
import assert from 'node:assert/strict'
import {
  openStore, closeStore, addNode, addWindowTurn, count, ingestTurn,
  rankCandidates, recallText, listPending, confirmNode,
} from './index.mjs'

const checks = []
function check(name, fn) {
  try {
    fn()
    checks.push({ name, ok: true })
  } catch (error) {
    checks.push({ name, ok: false, error: String(error?.message ?? error) })
  }
}

const db = openStore(':memory:')
try {
  check('单字召回：今天好累 -> 累', () => {
    addNode(db, { id: 'p1', type: 'event', subject: 'u:probe', description: '今天好累', owner_confirmed: 1 })
    const hits = rankCandidates(db, { subject: 'u:probe', query: '累', limit: 3 })
    assert.ok(hits.some((x) => x.id === 'p1'))
  })
  check('BM25 方向：相关 A 排最前', () => {
    addNode(db, { id: 'pA', type: 'event', subject: 'u:probe', description: '端口 6700 配置说明', entities: ['port:6700'], owner_confirmed: 1 })
    addNode(db, { id: 'pB', type: 'event', subject: 'u:probe', description: '端口 6700 附近', owner_confirmed: 1 })
    addNode(db, { id: 'pC', type: 'event', subject: 'u:probe', description: '今天天气不错', owner_confirmed: 1 })
    const hits = rankCandidates(db, { subject: 'u:probe', query: '端口 6700', limit: 3 })
    assert.equal(hits[0].id, 'pA')
  })
  check('实体候选：倩倩姐', () => {
    addNode(db, { id: 'pD', type: 'event', subject: 'u:probe', description: '今天压力大', entities: ['person:倩倩姐'], owner_confirmed: 1 })
    const hits = rankCandidates(db, { subject: 'u:probe', query: '倩倩姐', limit: 5 })
    assert.ok(hits.some((x) => x.id === 'pD'))
  })
  check('空值：raw_quote=null 可写', () => {
    addNode(db, { id: 'pE', type: 'event', subject: 'u:probe', description: '空值保护', raw_quote: null, owner_confirmed: 1 })
  })
  check('window_turns 幂等', () => {
    addWindowTurn(db, { windowId: 'pw', subject: 'u:probe', index: 1, role: 'user', text: 'a', ts: 1 })
    addWindowTurn(db, { windowId: 'pw', subject: 'u:probe', index: 1, role: 'user', text: 'b', ts: 2 })
    assert.equal(count(db, 'window_turns'), 1)
  })
  check('ingest 幂等 + 事实抽取', () => {
    const payload = { subject: 'u:probe', windowId: 'pw2', traceId: 'pt', turns: [{ index: 1, role: 'user', text: '记住我不喜欢吃香菜', ts: 3 }] }
    const a = ingestTurn(db, payload)
    const b = ingestTurn(db, payload)
    assert.equal(a.accepted, true)
    assert.equal(b.accepted, true)
    assert.ok(count(db, 'nodes') >= 2)
  })
  check('pending -> confirm', () => {
    addNode(db, { id: 'pP', type: 'fact', subject: 'person.probe', predicate: 'identity.claim', description: '身份事实', status: 'pending', owner_confirmed: 0 })
    assert.ok(listPending(db).some((x) => x.id === 'pP'))
    assert.equal(confirmNode(db, 'pP', true).ok, true)
  })
  check('空查询不抛', () => {
    assert.equal(recallText(db, { subject: 'u:probe', query: '' }), '')
  })
} finally {
  closeStore(db)
}

const ok = checks.every((x) => x.ok)
console.log(JSON.stringify({ ok, checks }, null, 2))
process.exitCode = ok ? 0 : 1
