import test from 'node:test'
import assert from 'node:assert/strict'
import { recordAclSession } from '../lib/services/acl-session-record.js'

function harness(overrides = {}) {
  const calls = []
  const store = { recordSession: (r) => calls.push(['record', r]), close: () => calls.push('close') }
  return {
    calls,
    deps: {
      entry: { sessionId: 's1', key: 'u:1' },
      surface: { subject: 'u:1', readonly: true, inheritedTools: ['read'] },
      kind: 'resumed',
      config: { aclEnabled: true },
      pathOf: () => 'acl.json',
      exists: () => true,
      openStore: (file, opts) => { calls.push(['open', file, opts.create]); return store },
      rolesFor: () => ['guest'],
      aclPolicy: () => ({}),
      debugLog: () => {},
      ...overrides,
    },
  }
}

test('aclEnabled=false 不写', () => {
  const h = harness({ config: { aclEnabled: false } })
  recordAclSession(h.deps)
  assert.equal(h.calls.length, 0)
})

test('库不存在不写', () => {
  const h = harness({ exists: () => false })
  recordAclSession(h.deps)
  assert.equal(h.calls.length, 0)
})

test('成功写入 snapshot 并 close', () => {
  const h = harness()
  recordAclSession(h.deps)
  assert.deepEqual(h.calls[0], ['open', 'acl.json', false])
  const rec = h.calls[1][1]
  assert.equal(rec.subjectId, 'u:1')
  assert.equal(rec.sessionId, 's1')
  assert.deepEqual(rec.roles, ['guest'])
  assert.equal(rec.surface.kind, 'resumed')
  assert.equal(rec.surface.readonly, true)
  assert.deepEqual(rec.surface.allowedTools, ['read'])
  assert.equal(h.calls[2], 'close')
})

test('open/record 抛错只记日志', () => {
  const logs = []
  const h = harness({
    openStore: () => { throw new Error('db') },
    debugLog: (m) => logs.push(m),
  })
  recordAclSession(h.deps)
  assert.match(logs[0], /record session snapshot failed/)
})
