import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

test('audit-plugins 必须 issues=0', () => {
  const out = execFileSync(process.execPath, ['D:\\DSH\\qqbot\\scripts\\audit-plugins.mjs'], { encoding: 'utf8' })
  assert.match(out, /issues=0/)
  assert.doesNotMatch(out, /越层 import/)
})
