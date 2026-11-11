import test from 'node:test'
import assert from 'node:assert/strict'
import { readContacts, contactLine, DEFAULT_CONTACTS } from '../lib/services/contacts-store.js'

const exists = () => true
const readFile = (file) => file

test('读取有效联系人文件', () => {
  const r = readContacts({
    file: '{"1":{"name":"A","gender":"male","role":"owner"}}',
    exists,
    readFile,
  })
  assert.equal(r.count, 1)
  assert.equal(r.all['1'].name, 'A')
})

test('文件缺失/非法/空对象回退内置', () => {
  for (const file of ['', 'not json', '{}', '[]']) {
    const r = readContacts({ file, exists: () => file !== '', readFile, debugLog: () => {} })
    assert.deepEqual(r.all, DEFAULT_CONTACTS)
    assert.equal(r.count, 3)
  }
})

test('contactLine：主人/朋友/未知', () => {
  const all = {
    '1815442184': { name: '主人', gender: 'male', role: 'owner' },
    '2930661826': { name: '倩倩姐', gender: 'female', role: 'friend' },
  }
  assert.equal(contactLine('u:1815442184', all), '【当前对话对象】主人（男，主人）')
  assert.equal(contactLine('u:2930661826', all), '【当前对话对象】倩倩姐（女，朋友）')
  assert.equal(contactLine('u:99999999', all), '')
  assert.equal(contactLine('', all), '')
})


test('没有 debugLog 时非法文件也不抛错', () => {
  const r = readContacts({ file: 'bad', exists: () => true, readFile: () => 'not json' })
  assert.deepEqual(r.all, DEFAULT_CONTACTS)
})
