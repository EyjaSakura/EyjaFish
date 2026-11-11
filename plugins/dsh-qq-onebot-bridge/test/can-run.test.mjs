import test from 'node:test'
import assert from 'node:assert/strict'
import { canRun } from '../lib/services/can-run.js'

function harness(overrides = {}) {
  return {
    message: { userId: 1 },
    capabilityId: 'send_image',
    options: {},
    config: {},
    subjectOfChat: () => 'chat:1',
    subjectOfSender: () => 'user:1',
    aclPolicy: () => ({}),
    evaluate: () => ({ allowed: true, reason: '', limits: {}, missing: [], denied: [] }),
    capabilities: new Map([['send_image', { flag: 'imageSendEnabled', need: [], limits: [] }]]),
    debugLog: () => {},
    ...overrides,
  }
}

test('未知能力', () => {
  const r = canRun(harness({ capabilityId: 'nope' }))
  assert.equal(r.allowed, false)
  assert.equal(r.reason, 'unknown-capability')
})

test('能力开关关闭', () => {
  const r = canRun(harness({ config: { imageSendEnabled: false } }))
  assert.equal(r.allowed, false)
  assert.match(r.reason, /能力开关关闭/)
})

test('ACL 允许 / 拒绝', () => {
  let subject
  const ok = canRun(harness({ options: { subject: 'chat' }, evaluate: (p, s) => { subject = s; return { allowed: true, reason: '', limits: {}, missing: [], denied: [] } } }))
  assert.equal(ok.allowed, true)
  assert.equal(subject, 'chat:1')

  const denied = canRun(harness({
    evaluate: () => ({ allowed: false, reason: 'no-role', limits: {}, missing: ['admin'], denied: [] }),
  }))
  assert.equal(denied.allowed, false)
  assert.equal(denied.reason, 'no-role')
})

test('拒绝时写 debug 日志', () => {
  const logs = []
  canRun(harness({
    debugLog: (m) => logs.push(m),
    evaluate: () => ({ allowed: false, reason: 'r', limits: {}, missing: ['a'], denied: ['b'] }),
  }))
  assert.match(logs[0], /canRun deny/)
  assert.match(logs[0], /missing=a/)
  assert.match(logs[0], /denied=b/)
})
