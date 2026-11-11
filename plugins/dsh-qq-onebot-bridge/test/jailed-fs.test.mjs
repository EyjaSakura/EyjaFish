import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, existsSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { registerJailedFsTools } from '../lib/services/jailed-fs.js'
import { apply } from '../lib/plugins/dsh-tool-fs-jailed/index.js'

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

function mount(root, extraRoots = []) {
  const tools = new Map()
  apply({ tools: { register: (tool) => tools.set(tool.name, tool) } }, { root, extraRoots })
  return tools
}

test('找不到插件：warn 且不 apply', async () => {
  const { deps, warns, applied } = harness({ file: '' })
  await registerJailedFsTools(deps)
  assert.match(warns[0], /没找到/)
  assert.equal(applied.length, 0)
})

test('owner 角色：不挂 jailed fs，保留 standard 全量', async () => {
  const { deps, applied } = harness({ role: { cwd: 'D:/work', guest: false } })
  await registerJailedFsTools(deps)
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

test('jailed fs：read 只读 jail 内文件', async () => {
  const root = mkdtempSync(join(tmpdir(), 'qq-jail-'))
  try {
    writeFileSync(join(root, 'hello.txt'), 'hello\nworld\n')
    const tools = mount(root)
    const value = await tools.get('read').execute({ file_path: 'hello.txt' })
    assert.match(value.text, /hello/)
    assert.match(value.text, /world/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('jailed fs：read 拒绝越狱绝对路径', async () => {
  const root = mkdtempSync(join(tmpdir(), 'qq-jail-'))
  try {
    const tools = mount(root)
    await assert.rejects(
      () => tools.get('read').execute({ file_path: 'C:\\Windows\\win.ini' }),
      /outside jail/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('jailed fs：glob 只返回 jail 内相对路径', async () => {
  const root = mkdtempSync(join(tmpdir(), 'qq-jail-'))
  try {
    mkdirSync(join(root, 'docs'))
    writeFileSync(join(root, 'docs', 'a.md'), 'a')
    const tools = mount(root)
    const value = await tools.get('glob').execute({ pattern: '**/*.md' })
    assert.match(value.text, /docs\/a\.md/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('jailed fs：grep 只搜 jail 内文件', async () => {
  const root = mkdtempSync(join(tmpdir(), 'qq-jail-'))
  try {
    writeFileSync(join(root, 'a.txt'), 'alpha\nbeta\n')
    const tools = mount(root)
    const value = await tools.get('grep').execute({ pattern: 'beta' })
    assert.match(value.text, /a\.txt:2/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
