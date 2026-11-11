import test from 'node:test'
import assert from 'node:assert/strict'
import { planAutoPost, AUTOPOST_TEXT } from '../lib/services/qzone-autopost.js'

const at = (h, m = 0) => new Date(2026, 10, 9, h, m, 0)

test('关闭 / 时间窗外不提醒', () => {
  assert.equal(planAutoPost({ config: { qzoneAutoPost: false } }).post, false)
  assert.equal(planAutoPost({ config: { qzonePostHourStart: 9, qzonePostHourEnd: 23 }, now: at(8) }).reason, 'outside-window')
})

test('间隔模式：冷却中 / 到期提醒', () => {
  const now = at(10)
  assert.equal(planAutoPost({ state: { nextAt: now.getTime() + 1000 }, config: {}, now }).post, false)
  const p = planAutoPost({
    state: { nextAt: 0 },
    config: { qzonePostMinGapMinutes: 60, qzonePostMaxGapMinutes: 60 },
    now,
    random: () => 0,
  })
  assert.equal(p.post, true)
  assert.equal(p.gapMinutes, 60)
  assert.equal(p.state.nextAt, now.getTime() + 60 * 60_000)
})

test('每日模式：未到点 / 今天已发 / 到点', () => {
  const config = {}
  assert.equal(planAutoPost({ state: { mode: 'daily', hour: 15 }, config, now: at(14) }).reason, 'not-due')
  assert.equal(planAutoPost({ state: { mode: 'daily', hour: 9, lastDate: '2026-11-09' }, config, now: at(10) }).post, false)
  const p = planAutoPost({
    state: { mode: 'daily', hour: 9, lastDate: '2026-11-08' },
    config,
    now: at(10),
    random: () => 0.5,
  })
  assert.equal(p.post, true)
  assert.equal(p.state.mode, 'daily')
  assert.ok(p.state.lastDate)
  assert.ok(p.gapMinutes >= 240)
})

test('文案包含工具与约束', () => {
  assert.match(AUTOPOST_TEXT, /qq_post_qzone/)
  assert.match(AUTOPOST_TEXT, /只做这件事/)
})
