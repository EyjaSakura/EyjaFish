import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolvePersona, personaConfig } from '../lib/services/persona.js'

function makeDir() {
  return mkdtempSync(join(tmpdir(), 'dsh-persona-'))
}

test('personaConfig 归一化脏输入', () => {
  assert.equal(personaConfig({}).enabled, true)
  assert.equal(personaConfig({ persona: { enabled: false } }).enabled, false)
  const cfg = personaConfig({ persona: { dir: '  D:\\x  ', chats: { 'u:1': ' hi ' }, owner: 'o' } })
  assert.equal(cfg.dir, 'D:\\x')
  assert.equal(cfg.chats['u:1'], 'hi')
  assert.equal(cfg.owner, 'o')
})

test('resolvePersona 优先 chat 文件，其次角色文件，最后 default', () => {
  const dir = makeDir()
  writeFileSync(join(dir, 'default.md'), 'DEFAULT')
  writeFileSync(join(dir, 'owner.md'), 'OWNER')
  writeFileSync(join(dir, 'chat-u_1.md'), 'CHAT')
  const config = { persona: { dir } }
  const cache = new Map()

  assert.deepEqual(resolvePersona({ config, role: {}, key: 'u:1', cache }).text, 'CHAT')
  assert.deepEqual(resolvePersona({ config, role: {}, key: 'u:2', cache }).text, 'OWNER')
  assert.deepEqual(resolvePersona({ config, role: { guest: true }, key: 'u:3', cache }).text, 'DEFAULT')
})

test('resolvePersona 追加 extra.md，并识别 disabled', () => {
  const dir = makeDir()
  writeFileSync(join(dir, 'default.md'), 'DEFAULT')
  writeFileSync(join(dir, 'extra.md'), 'EXTRA')
  const cache = new Map()
  const r = resolvePersona({ config: { persona: { dir } }, role: {}, key: 'u:1', cache })
  assert.match(r.text, /DEFAULT/)
  assert.match(r.text, /EXTRA/)
  assert.equal(r.source, 'file:default.md+file:extra.md')

  const disabled = resolvePersona({ config: { persona: { dir, enabled: false } }, role: {}, key: 'u:1', cache })
  assert.equal(disabled.text, '')
  assert.equal(disabled.source, 'disabled')
})

test('resolvePersona 会按 mtime/size 缓存失效', () => {
  const dir = makeDir()
  const file = join(dir, 'default.md')
  writeFileSync(file, 'A')
  const cache = new Map()
  const config = { persona: { dir } }
  assert.equal(resolvePersona({ config, role: {}, key: 'u:1', cache }).text, 'A')
  writeFileSync(file, 'BB')
  assert.equal(resolvePersona({ config, role: {}, key: 'u:1', cache }).text, 'BB')
})
