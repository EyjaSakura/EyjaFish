import test from 'node:test'
import assert from 'node:assert/strict'

import { nextActivityGapMinutes } from '../lib/services/activity-gap.js'

test('activity 1C：自由活动间隔为 2–4 小时', () => {
  assert.equal(nextActivityGapMinutes(() => 0), 120)
  assert.equal(nextActivityGapMinutes(() => 0.999999), 239)
})
