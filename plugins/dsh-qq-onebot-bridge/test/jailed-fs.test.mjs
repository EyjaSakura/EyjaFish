import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { registerJailedFsTools } from '../lib/services/jailed-fs.js'

function harness(overrides = {}) {
  const warns = []
  const applied = []
  const deps = {
    agentCtx: {},
    role: { cwd: 'D:/work' },
    key: 'u:1',
    surface: null,
    file: 'D:/plugin/index.js',
    loadPlugin: async () => ({ apply: (ctx, opts) => applied.push([ctx, opts]) }),
    sharedRoot: () => mkdtempSync(join(tmpdir(), 'shared-')),
    aclPolicy: () => ({}),
    logger: { warn: (m) => warns.push(m) },
    debugLog: () => {},
    ...overrides,
  }
  return { deps, warns, applied }
}

test('找不到插件：warn 且不 apply', async () => {
  const { deps, warns, applied } = harness({ file: '' })
  await registerJailedFsTools(deps)
  assert.match(warns[0], /没找到/)
  assert.equal(applied.length, 0)
})

test('正常注册：root = role.cwd', async () => {
  const { deps, applied } = harness()
  await registerJailedFsTools(deps)
  assert.deepEqual(applied[0][1], { root: 'D:/work', extraRoots: [] })
})

test('sharedRead：创建共享目录并追加 prefix', async () => {
  const { deps, applied } = harness({ surface: { sharedRead: true } })
  await registerJailedFsTools(deps)
  const extra = applied[0][1].extraRoots
  assert.equal(extra.length, 1)
  assert.equal(extra[0].prefix, 'shared')
  assert.ok(existsSync(extra[0].root))
})

test('共享目录创建失败：仍注册且 warn', async () => {
  const { deps, applied, warns } = harness({
    surface: { sharedRead: true },
    sharedRoot: () => 'Z:/definitely/not/here',
  })
  await registerJailedFsTools(deps)
  assert.deepEqual(applied[0][1].extraRoots, [])
  assert.match(warns[0], /共享只读区不可用/)
})

test('加载失败：warn 不抛', async () => {
  const { deps, warns } = harness({ loadPlugin: async () => { throw new Error('load') } })
  await registerJailedFsTools(deps)
  assert.match(warns[0], /注册受限读工具失败/)
})
