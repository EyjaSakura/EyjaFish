import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeWatchdogIncidents } from '../lib/services/watchdog-report.js'

const line = (o) => JSON.stringify(o)

test('空记录', () => {
  const s = summarizeWatchdogIncidents('', 0)
  assert.equal(s.fresh.length, 0)
  assert.equal(s.alertable, false)
})

test('按水位线过滤并计数', () => {
  const raw = [
    line({ at: 10, kind: 'down' }),
    line({ at: 20, kind: 'restart' }),
    line({ at: 30, kind: 'rate-limited' }),
    line({ at: 40, kind: 'down' }),
  ].join('\n')
  const s = summarizeWatchdogIncidents(raw, 15)
  assert.equal(s.fresh.length, 3)
  assert.equal(s.downs, 1)
  assert.equal(s.restarts, 1)
  assert.equal(s.limited, 1)
  assert.equal(s.lastAt, 40)
  assert.equal(s.alertable, true)
  assert.match(s.lines.join('\n'), /掉线 1 次/)
  assert.match(s.lines.join('\n'), /限流 1 次/)
})

test('只有 recovered 不告警，但带停机时长', () => {
  const raw = line({ at: 5, kind: 'recovered', downtimeSeconds: 12 })
  const s = summarizeWatchdogIncidents(raw, 0)
  assert.equal(s.alertable, false)
  assert.match(s.lines.join('\n'), /停机 12 秒/)
})

test('坏行跳过，水位线取最大', () => {
  const raw = ['not json', line({ at: 7, kind: 'down' }), ''].join('\n')
  const s = summarizeWatchdogIncidents(raw, 0)
  assert.equal(s.fresh.length, 1)
  assert.equal(s.lastAt, 7)
})
