import test from 'node:test'
import assert from 'node:assert/strict'
import { assistantText, splitSegments, isQuietTime } from '../lib/shared-helpers.js'
import { CAPABILITIES, CAPABILITY_BY_ID, LIMITS, validateCapabilityTable } from '../lib/capabilities.js'

test('assistantText 只拼 text 块', () => {
  assert.equal(assistantText({ data: { message: { content: [{ type: 'text', text: 'a' }, { type: 'image' }, { type: 'text', text: 'b' }] } } }), 'ab')
})

test('splitSegments：按文本长度拆批，图片按 1 算', () => {
  const seg = (text) => ({ type: 'text', data: { text } })
  const img = { type: 'image', data: {} }
  assert.deepEqual(splitSegments([seg('1234'), seg('5678')], 4).map((b) => b.length), [1, 1])
  assert.deepEqual(splitSegments([img, img], 1).map((b) => b.length), [1, 1])
  assert.deepEqual(splitSegments([], 10), [])
})

test('isQuietTime：关闭 / 周末豁免 / 普通 / 跨夜', () => {
  const at = (day, h, m = 0) => new Date(2026, 10, day, h, m, 0) // 2026-11-09 是周一
  const cfg = { quietHoursEnabled: true, quietWeekendExempt: false }
  assert.equal(isQuietTime({ quietHoursEnabled: false }, [{ start: 0, end: 1440 }], at(9, 12)), false)
  assert.equal(isQuietTime(cfg, [], at(9, 12)), false)
  assert.equal(isQuietTime(cfg, [{ start: 9 * 60, end: 18 * 60 }], at(9, 12)), true)
  assert.equal(isQuietTime(cfg, [{ start: 9 * 60, end: 18 * 60 }], at(9, 8)), false)
  assert.equal(isQuietTime(cfg, [{ start: 22 * 60, end: 6 * 60 }], at(9, 23)), true)
  assert.equal(isQuietTime(cfg, [{ start: 22 * 60, end: 6 * 60 }], at(9, 12)), false)
  assert.equal(isQuietTime({ quietHoursEnabled: true, quietWeekendExempt: true }, [{ start: 0, end: 1440 }], at(14, 12)), false)
})

test('capabilities 表自身一致', () => {
  assert.ok(CAPABILITIES.length > 0)
  assert.equal(CAPABILITY_BY_ID.size, CAPABILITIES.length)
  assert.ok(Object.keys(LIMITS).length > 0)
  assert.deepEqual(validateCapabilityTable(), [])
})
