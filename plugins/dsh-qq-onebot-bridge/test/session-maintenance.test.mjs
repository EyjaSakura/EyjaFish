import test from 'node:test'
import assert from 'node:assert/strict'
import { runSessionMaintenance } from '../lib/core/session-maintenance.js'

test('按顺序执行所有步骤', async () => {
  const order = []
  await runSessionMaintenance({
    steps: [
      { label: 'a', run: async () => order.push('a') },
      { label: 'b', run: async () => order.push('b') },
    ],
    debugLog: () => {},
  })
  assert.deepEqual(order, ['a', 'b'])
})

test('单步失败只记日志，继续后续步骤', async () => {
  const order = []
  const logs = []
  await runSessionMaintenance({
    steps: [
      { label: 'reconcile', run: async () => { throw new Error('boom') } },
      { label: 'preclaim', run: async () => order.push('preclaim') },
    ],
    debugLog: (m) => logs.push(m),
  })
  assert.deepEqual(order, ['preclaim'])
  assert.deepEqual(logs, ['reconcile failed: boom'])
})


test('没有 debugLog 时失败也不抛错', async () => {
  await runSessionMaintenance({ steps: [{ label: 'x', run: async () => { throw new Error('boom') } }] })
})
