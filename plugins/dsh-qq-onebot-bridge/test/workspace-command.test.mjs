import test from 'node:test'
import assert from 'node:assert/strict'
import { handleWorkspaceCommand } from '../lib/services/workspace-command.js'

function harness(overrides = {}) {
  const replies = []
  const calls = []
  const list = [
    { title: '项目A', path: 'D:/a' },
    { title: '项目B', path: 'D:/b' },
  ]
  const deps = {
    message: {},
    text: '/ws',
    routeKey: 'u:1',
    canSwitch: () => true,
    readRegistry: () => list,
    formatList: () => '工作区列表',
    getBinding: () => null,
    clearBinding: (key) => calls.push(['clear', key]),
    disposeSession: async (key) => calls.push(['dispose', key]),
    matchWorkspace: (arg) => list.find((w) => w.title === arg) ?? null,
    workspaceSessions: () => [{ id: 'session-12345678' }],
    workspaceSessionBusy: async () => false,
    setBinding: (key, b) => calls.push(['bind', key, b]),
    safeReply: async (_m, t) => replies.push(t),
    ...overrides,
  }
  return { deps, replies, calls, list }
}

test('非命令 / 无权限 / 空登记表', async () => {
  assert.equal(await handleWorkspaceCommand(harness({ text: '你好' }).deps), false)

  const denied = harness({ canSwitch: () => false })
  assert.equal(await handleWorkspaceCommand(denied.deps), true)
  assert.match(denied.replies[0], /管理员/)

  const empty = harness({ readRegistry: () => [] })
  assert.equal(await handleWorkspaceCommand(empty.deps), true)
  assert.match(empty.replies[0], /登记表/)
})

test('列表命令', async () => {
  const { deps, replies } = harness({ text: '/ws 列表' })
  assert.equal(await handleWorkspaceCommand(deps), true)
  assert.equal(replies[0], '工作区列表')
})

test('off：未绑定 / 已绑定', async () => {
  const none = harness({ text: '/ws off' })
  assert.equal(await handleWorkspaceCommand(none.deps), true)
  assert.match(none.replies[0], /没有绑定/)

  const bound = harness({
    text: '/ws off',
    getBinding: () => ({ title: '项目A', path: 'D:/a' }),
  })
  assert.equal(await handleWorkspaceCommand(bound.deps), true)
  assert.deepEqual(bound.calls.map((c) => c[0]), ['clear', 'dispose'])
  assert.match(bound.replies[0], /已退出工作区/)
})

test('找不到目标', async () => {
  const { deps, replies } = harness({ text: '/ws 不存在' })
  assert.equal(await handleWorkspaceCommand(deps), true)
  assert.match(replies[0], /没找到工作区/)
})

test('切换：续接最新会话 / 被占用 / 无会话', async () => {
  const normal = harness({ text: '/ws 项目A' })
  assert.equal(await handleWorkspaceCommand(normal.deps), true)
  const bind = normal.calls.find((c) => c[0] === 'bind')
  assert.equal(bind[2].sessionId, 'session-12345678')
  assert.match(normal.replies[0], /继续最新会话/)

  const busy = harness({ text: '/ws 项目A', workspaceSessionBusy: async () => true })
  await handleWorkspaceCommand(busy.deps)
  assert.equal(busy.calls.find((c) => c[0] === 'bind')[2].sessionId, '')
  assert.match(busy.replies[0], /正被其他窗口占用/)

  const empty = harness({ text: '/ws 项目A', workspaceSessions: () => [] })
  await handleWorkspaceCommand(empty.deps)
  assert.match(empty.replies[0], /还没有会话/)
})
