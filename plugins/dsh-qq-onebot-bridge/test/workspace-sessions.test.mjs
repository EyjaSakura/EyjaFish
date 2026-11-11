import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { workspaceSessions } from '../lib/services/workspace-sessions.js'
import { workspaceProjectKey } from '../lib/core/workspace-key.js'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'ws-'))
  const wsPath = 'D:/project'
  const dir = join(root, workspaceProjectKey(wsPath))
  mkdirSync(dir, { recursive: true })
  return { root, wsPath, dir }
}

test('扫描会话目录并按 mtime 倒序', () => {
  const { root, wsPath, dir } = fixture()
  const a = join(dir, 's-a'); mkdirSync(a)
  const b = join(dir, 's-b'); mkdirSync(b)
  writeFileSync(join(a, 'session.meta'), '{}')
  utimesSync(a, 1000, 1000)
  utimesSync(join(a, 'session.meta'), 3000, 3000)
  utimesSync(b, 2000, 2000)
  const out = workspaceSessions({ ws: { path: wsPath }, sessionRoot: root, findSessionDir: () => '' })
  assert.deepEqual(out.map((x) => x.id), ['s-a', 's-b'])
})

test('忽略非目录与 session.lock', () => {
  const { root, wsPath, dir } = fixture()
  writeFileSync(join(dir, 'not-dir'), 'x')
  const c = join(dir, 's-c'); mkdirSync(c)
  writeFileSync(join(c, 'session.lock'), 'x')
  const out = workspaceSessions({ ws: { path: wsPath }, sessionRoot: root, findSessionDir: () => '' })
  assert.deepEqual(out.map((x) => x.id), ['s-c'])
})

test('sessionIds 兜底 findSessionDir', () => {
  const { root, wsPath } = fixture()
  const other = join(root, 'other'); mkdirSync(other)
  writeFileSync(join(other, 'session.meta'), '{}')
  const out = workspaceSessions({
    ws: { path: wsPath, sessionIds: ['s-x'] },
    sessionRoot: join(root, 'missing'),
    findSessionDir: (id) => (id === 's-x' ? other : ''),
  })
  assert.deepEqual(out.map((x) => x.id), ['s-x'])
})
