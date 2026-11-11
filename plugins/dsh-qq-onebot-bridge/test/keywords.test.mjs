import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { normalizeEntry, parseKeywordCommand, KeywordStore } from '../lib/keywords.js'

test('normalizeEntry', () => {
  assert.equal(normalizeEntry(null), null)
  assert.equal(normalizeEntry({ reply: [] }), null)
  assert.equal(normalizeEntry({ trigger: 'x' }), null)
  const e = normalizeEntry({ trigger: ' 你好 ', match: 'exact', reply: ['a', ''], image: ' i.png ', scope: 'group', cooldownSeconds: 5 })
  assert.deepEqual(e, { trigger: '你好', match: 'exact', reply: ['a'], image: 'i.png', scope: 'group', cooldownSeconds: 5 })
  assert.equal(normalizeEntry({ trigger: 'x', reply: 'hi' }).match, 'contains')
  assert.equal(normalizeEntry({ trigger: 'x', reply: ['hi'], match: 'bad' }).match, 'contains')
})

test('parseKeywordCommand', () => {
  assert.equal(parseKeywordCommand('你好'), null)
  assert.deepEqual(parseKeywordCommand('/kw list'), { action: 'list', trigger: '', reply: '' })
  assert.deepEqual(parseKeywordCommand('/词库 add 你好 你好呀'), { action: 'add', trigger: '你好', reply: '你好呀' })
  assert.deepEqual(parseKeywordCommand('/kw del 你好'), { action: 'remove', trigger: '你好', reply: '' })
  assert.equal(parseKeywordCommand('/kw add'), null)
  assert.equal(parseKeywordCommand('/kw bad x'), null)
})

function store() {
  return new KeywordStore(join(mkdtempSync(join(tmpdir(), 'kw-')), 'keywords.json'))
}

test('KeywordStore：add/save/load/match', () => {
  const s = store()
  s.add({ trigger: '你好', reply: ['你好呀'] })
  s.add({ trigger: '你好', reply: ['覆盖'] })
  assert.equal(s.save(), true)
  assert.equal(s.list().length, 1)

  assert.deepEqual(s.match('你好啊', { rng: () => 0 }), { reply: '覆盖', image: '', trigger: '你好' })
  assert.equal(s.match('/你好'), null)
  assert.equal(s.match(''), null)
})

test('KeywordStore：scope / 优先级 / regex / exact', () => {
  const s = store()
  s.add({ trigger: '群', reply: ['群回复'], scope: 'group' })
  s.add({ trigger: '私', reply: ['私回复'], scope: 'private' })
  s.add({ trigger: '^a+$', match: 'regex', reply: ['regex'] })
  s.add({ trigger: 'exact', match: 'exact', reply: ['exact'] })

  assert.equal(s.match('群', { isGroup: false }), null)
  assert.equal(s.match('群', { isGroup: true }).reply, '群回复')
  assert.equal(s.match('私', { isGroup: true }), null)
  assert.equal(s.match('aaa', { rng: () => 0 }).reply, 'regex')
  assert.equal(s.match('exactly', { rng: () => 0 }), null)
  assert.equal(s.match('exact', { rng: () => 0 }).reply, 'exact')
})

test('KeywordStore：冷却 / 聊天级优先 / remove', () => {
  const s = store()
  s.add({ trigger: '好', reply: ['全局'] })
  s.add({ trigger: '好', reply: ['聊天'] }, 'u:1')
  assert.equal(s.match('好', { chatKey: 'u:1', rng: () => 0 }).reply, '聊天')

  s.add({ trigger: '冷', reply: ['x'], cooldownSeconds: 60 }, 'u:1')
  assert.equal(s.match('冷', { chatKey: 'u:1', now: 1000 }).reply, 'x')
  assert.equal(s.match('冷', { chatKey: 'u:1', now: 2000 }), null)

  assert.equal(s.remove('好', 'u:1'), true)
  assert.equal(s.match('好', { chatKey: 'u:1', rng: () => 0 }).reply, '全局')
  assert.equal(s.remove('不存在'), false)
})

test('KeywordStore：坏 JSON 回退空库', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'kw-')), 'keywords.json')
  writeFileSync(file, 'not json')
  const s = new KeywordStore(file)
  assert.deepEqual(s.list(), [])
})
