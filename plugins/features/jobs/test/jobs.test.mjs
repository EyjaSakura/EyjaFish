import test from 'node:test'
import assert from 'node:assert/strict'

import { hooks } from '../index.js'

test('jobs：hooks 暴露分析结果轮询', () => {
  assert.deepEqual(Object.keys(hooks), ['pollAnalyzeResults'])
  assert.equal(typeof hooks.pollAnalyzeResults, 'function')
})
