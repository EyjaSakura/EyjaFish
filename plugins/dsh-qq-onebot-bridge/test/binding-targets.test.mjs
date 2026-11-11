import test from 'node:test'
import assert from 'node:assert/strict'
import { collectBindingTargets } from '../lib/services/binding-targets.js'

const store = (data) => ({ read: () => data })

test('工作区绑定优先，会话表补缺', () => {
  const targets = collectBindingTargets({
    workspaceStore: store({ 'u:1': { sessionId: 'ws1' }, 'u:2': { sessionId: '' } }),
    sessionStore: store({ 'u:1': 'old', 'u:2': 's2' }),
    debugLog: () => {},
  })
  assert.equal(targets.get('u:1'), 'ws1')
  assert.equal(targets.get('u:2'), 's2')
})

test('忽略非法绑定', () => {
  const targets = collectBindingTargets({
    workspaceStore: store({ a: null, b: {}, c: { sessionId: 1 }, d: { sessionId: 'ok' } }),
    sessionStore: store({ d: 'x', e: 42 }),
    debugLog: () => {},
  })
  assert.deepEqual([...targets.keys()], ['d'])
  assert.equal(targets.get('d'), 'ok')
})

test('存储抛错只记日志', () => {
  const logs = []
  const throwStore = { read: () => { throw new Error('disk') } }
  const targets = collectBindingTargets({ workspaceStore: throwStore, sessionStore: throwStore, debugLog: (m) => logs.push(m) })
  assert.equal(targets.size, 0)
  assert.equal(logs.length, 2)
})


test('没有 debugLog 时存储错误也不抛错', () => {
  const throwStore = { read: () => { throw new Error('disk') } }
  assert.equal(collectBindingTargets({ workspaceStore: throwStore, sessionStore: throwStore }).size, 0)
})
