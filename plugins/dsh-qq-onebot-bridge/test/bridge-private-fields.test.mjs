import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const file = fileURLToPath(new URL('../lib/bridge.js', import.meta.url))

test('bridge.js：所有 this.#私有字段都在类内声明', () => {
  const source = readFileSync(file, 'utf8')
  const declared = new Set()
  for (const match of source.matchAll(/^\s{2}(?:async\s+)?#([A-Za-z_$][\w$]*)\s*\(/gm)) {
    declared.add(match[1])
  }
  const used = new Set()
  for (const match of source.matchAll(/this\.#([A-Za-z_$][\w$]*)/g)) {
    used.add(match[1])
  }
  const missing = [...used].filter((name) => !declared.has(name))
  assert.deepEqual(missing, [], `未声明的私有成员：${missing.join(', ')}`)
})
