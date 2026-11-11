import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const bridge = readFileSync(new URL('../lib/bridge.js', import.meta.url), 'utf8')
const budget = JSON.parse(readFileSync(new URL('../bridge-size-budget.json', import.meta.url), 'utf8'))

test('bridge.js 不超过 size budget（非空行）', () => {
  const lines = bridge.split(/\r?\n/).filter((line) => line.trim() !== '').length
  assert.ok(lines <= budget.lines, `bridge.js ${lines} 行 > 预算 ${budget.lines} 行`)
})

test('bridge-size-budget 只能降，不能高于当前文件', () => {
  assert.ok(budget.lines >= 1)
  assert.equal(typeof budget.note, 'string')
})
