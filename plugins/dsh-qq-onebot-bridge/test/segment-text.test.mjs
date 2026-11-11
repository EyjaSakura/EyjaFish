import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeSegments } from '../lib/core/segment-text.js'

test('summarizeSegments：文本 + 非文本占位 + 截断', () => {
  assert.equal(summarizeSegments([{ type: 'text', data: { text: 'hi' } }, { type: 'face' }]), 'hi[face]')
  assert.equal(summarizeSegments(null), '')
  assert.equal(summarizeSegments('x'), '')
  assert.equal(summarizeSegments([{ type: 'text', data: { text: 'a'.repeat(300) } }]).length, 200)
})
