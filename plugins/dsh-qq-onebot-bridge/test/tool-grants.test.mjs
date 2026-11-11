import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveToolSurface, allowedToolNames, explainToolSurface, TOOL_GRANTS } from '../lib/tool-grants.js'

function policy(permissions, extra = {}) {
  return {
    roles: { guest: { permissions }, admin: { permissions: ['tool.shell', 'tool.fs.write:own'] } },
    defaultRole: 'guest',
    ...extra,
  }
}

test('只读主体：读 + 联网，无 shell', () => {
  const s = resolveToolSurface(policy(['tool.fs.read:own', 'tool.net.search']), 'user:5')
  assert.ok(s.allowed.includes('tool.fs.read:*'))
  assert.ok(s.allowed.includes('tool.net.search'))
  assert.ok(s.inheritedTools.includes('read'))
  assert.ok(s.inheritedTools.includes('web_search'))
  assert.equal(s.requiresFullPreset, false)
  assert.equal(s.readonly, true)
  assert.equal(s.needRestrict, true)
  assert.equal(s.scoped.web, true)
})

test('管理员：shell + 写 → 需要完整 preset', () => {
  const p = policy([])
  p.assignments = { 'user:5': ['admin'] }
  const s = resolveToolSurface(p, 'user:5')
  assert.ok(s.allowed.includes('tool.shell'))
  assert.ok(s.allowed.includes('tool.fs.write:*'))
  assert.equal(s.requiresFullPreset, true)
  assert.equal(s.readonly, false)
  assert.ok(s.inheritedTools.includes('pwsh'))
})

test('deny 覆盖 allow', () => {
  const p = policy(['tool.fs.read:own', 'tool.net.search'], { subjectDenies: { 'user:5': ['tool.net.search'] } })
  const s = resolveToolSurface(p, 'user:5')
  assert.equal(s.decisions['tool.net.search'].allowed, false)
  assert.equal(s.inheritedTools.includes('web_search'), false)
})

test('无角色：全部拒绝', () => {
  const s = resolveToolSurface({ roles: {}, defaultRole: 'guest' }, 'user:9')
  assert.equal(s.allowed.length, 0)
  assert.equal(s.readonly, true)
})

test('scoped 工具按能力放行', () => {
  const p = policy(['tool.chat.media', 'tool.chat.faces', 'tool.memory.read'])
  const s = resolveToolSurface(p, 'user:5')
  const names = allowedToolNames(s)
  for (const n of ['qq_send_image', 'qq_send_file', 'qq_send_voice', 'qq_face_list', 'memory_search']) {
    assert.ok(names.has(n), n)
  }
})

test('explainToolSurface 带主体和拒绝项', () => {
  const s = resolveToolSurface(policy([]), 'user:5')
  const text = explainToolSurface(s)
  assert.match(text, /user:5/)
  assert.equal(TOOL_GRANTS.length > 0, true)
})
