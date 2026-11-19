import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { pickKnowledge } from '../lib/services/knowledge-picker.js'

test('knowledge-picker：按最近使用选择并记录', () => {
  const dir = mkdtempSync(join(tmpdir(), 'knowledge-'))
  try {
    const root = join(dir, 'knowledge')
    const usage = join(dir, 'usage.json')
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'history.jsonl'), [
      JSON.stringify({ id: 'a', category: 'history', text: 'A 事实' }),
      JSON.stringify({ id: 'b', category: 'history', text: 'B 事实' }),
    ].join('\n'), 'utf8')
    const first = pickKnowledge({ root, usageFile: usage, random: () => 0 })
    const second = pickKnowledge({ root, usageFile: usage, random: () => 0 })
    assert.notEqual(first.id, second.id)
    const raw = JSON.parse(readFileSync(usage, 'utf8'))
    assert.ok(raw[first.id].count >= 1)
    assert.ok(raw[second.id].count >= 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
