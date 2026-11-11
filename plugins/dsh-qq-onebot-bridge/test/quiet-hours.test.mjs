import test from 'node:test'
import assert from 'node:assert/strict'
import { parseQuietRanges, isQuietTime } from '../lib/core/quiet-hours.js'

const at = (day, h, m = 0) => new Date(2026, 10, day, h, m, 0)

test('parseQuietRanges：全角/横线/非法/相等', () => {
  assert.deepEqual(parseQuietRanges(['9:00-12:00', '１４：００－１８：００']), [{ start: 540, end: 720 }, { start: 840, end: 1080 }])
  assert.deepEqual(parseQuietRanges(['25:00-26:00', '10:00-10:00', 'bad']), [])
  assert.deepEqual(parseQuietRanges(null), [])
})

test('isQuietTime：关闭 / 周末豁免 / 普通 / 跨夜', () => {
  const on = { quietHoursEnabled: true, quietWeekendExempt: false }
  assert.equal(isQuietTime({ quietHoursEnabled: false }, [{ start: 0, end: 1440 }], at(9, 12)), false)
  assert.equal(isQuietTime(on, [{ start: 540, end: 720 }], at(9, 10)), true)
  assert.equal(isQuietTime(on, [{ start: 540, end: 720 }], at(9, 12)), false)
  assert.equal(isQuietTime(on, [{ start: 1320, end: 360 }], at(9, 23)), true)
  assert.equal(isQuietTime(on, [{ start: 1320, end: 360 }], at(9, 12)), false)
  assert.equal(isQuietTime({ quietHoursEnabled: true, quietWeekendExempt: true }, [{ start: 0, end: 1440 }], at(15, 12)), false)
})
