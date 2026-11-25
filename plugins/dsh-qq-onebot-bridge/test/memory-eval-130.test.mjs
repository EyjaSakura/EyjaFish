import test from 'node:test'
import assert from 'node:assert/strict'

import {
  openStore, closeStore, addNode, searchCandidates, rankCandidates,
  validateExtraction, isTrivialMemory,
} from '../../memory-core/index.mjs'
import { detectConflicts } from '../../memory-core/consolidate.mjs'

// 130 synthetic acceptance cases across the engine surfaces that can be
// checked deterministically. This is a regression harness, not a substitute
// for the 30-pair human blind review.
test('memory eval：130 条合成验收用例', () => {
  const db = openStore(':memory:')
  let cases = 0
  try {
    for (let i = 1; i <= 30; i++) {
      const id = `eval-recall-${i}`
      const topic = `唯一主题${i}`
      addNode(db, { id, type: 'event', subject: 'eval:recall', description: `${topic} 端口 ${6700 + i}`, owner_confirmed: 1 })
      const ranked = rankCandidates(db, { subject: 'eval:recall', query: topic, limit: 5 })
      assert.ok(ranked.some((row) => row.id === id), `fact recall ${i}`)
      cases++
    }

    for (let i = 1; i <= 20; i++) {
      const subject = `eval:update:${i}`
      addNode(db, { id: `eval-update-old-${i}`, type: 'fact', subject, predicate: 'port', description: `端口 ${7000 + i}`, owner_confirmed: 1 })
      addNode(db, { id: `eval-update-new-${i}`, type: 'fact', subject, predicate: 'port', description: `端口 ${7100 + i}`, owner_confirmed: 1 })
      assert.equal(db.prepare('SELECT status FROM nodes WHERE id=?').get(`eval-update-old-${i}`).status, 'superseded', `time update ${i}`)
      assert.equal(db.prepare('SELECT status FROM nodes WHERE id=?').get(`eval-update-new-${i}`).status, 'active', `time update new ${i}`)
      cases++
    }

    for (let i = 1; i <= 20; i++) {
      const subject = `eval:conflict:${i}`
      addNode(db, { id: `eval-conflict-a-${i}`, type: 'fact', subject, predicate: 'value', description: `版本 A${i}`, owner_confirmed: 1 })
      addNode(db, { id: `eval-conflict-b-${i}`, type: 'fact', subject, predicate: 'value', description: `版本 B${i}`, owner_confirmed: 1 })
      assert.ok(detectConflicts(db).some((row) => row.subject === subject), `conflict ${i}`)
      cases++
    }

    for (let i = 1; i <= 15; i++) {
      addNode(db, { id: `eval-window-a-${i}`, type: 'event', subject: 'eval:window:a', description: `窗口隔离词${i}`, owner_confirmed: 1 })
      addNode(db, { id: `eval-window-b-${i}`, type: 'event', subject: 'eval:window:b', description: `窗口隔离词${i}`, owner_confirmed: 1 })
      const rows = searchCandidates(db, `窗口隔离词${i}`, { subject: 'eval:window:a' })
      assert.ok(rows.some((row) => row.id === `eval-window-a-${i}`), `window a ${i}`)
      assert.ok(!rows.some((row) => row.id === `eval-window-b-${i}`), `window b leak ${i}`)
      cases++
    }

    for (let i = 1; i <= 15; i++) {
      const id = `eval-entity-${i}`
      addNode(db, { id, type: 'event', subject: 'eval:entity', description: `倩倩姐 最近压力大 ${i}`, entities: ['person:倩倩姐'], owner_confirmed: 1 })
      const ranked = rankCandidates(db, { subject: 'eval:entity', query: '倩倩姐', limit: 20 })
      assert.ok(ranked.some((row) => row.id === id), `entity recall ${i}`)
      cases++
    }

    for (let i = 1; i <= 15; i++) {
      const nodes = validateExtraction([
        { type: 'fact', source: 'assistant', description: `助手编造事实${i}` },
        { type: 'fact', source: 'external_web', description: `网页事实${i}` },
        { type: 'event', source: 'user_message', description: `真实事件${i}`, turn_index: 1 },
      ], { subject: 'eval:adversarial', windowId: 'eval', traceId: `eval-adv-${i}`, turns: [{ index: 1, role: 'user', text: `真实事件${i}` }] })
      assert.equal(nodes.length, 1, `adversarial ${i}`)
      cases++
    }

    for (const text of ['好嘞', '嗯嗯', '收到', '知道了', '明白了', '原来如此', '原来是这样', '这样啊', '真的吗', '笑死', '绷不住', '用户表示理解', '用户表示明白', '用户表示收到', '用户表示同意']) {
      assert.equal(isTrivialMemory(text), true, `quality ${text}`)
      cases++
    }

    assert.equal(cases, 130)
  } finally {
    closeStore(db)
  }
})
