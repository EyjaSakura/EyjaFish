import test from 'node:test'
import assert from 'node:assert/strict'
import { sendFileTo } from '../lib/services/send-file.js'

function harness(overrides = {}) {
  const calls = []
  return {
    calls,
    deps: {
      route: { bot: {}, messageType: 'group', targetId: 9 },
      file: 'D:/a.txt',
      name: '',
      chatKey: 'g:9',
      gate: { run: async (action, key, name, run) => ({ ok: true, value: await run() }) },
      server: { uploadFile: async (...args) => calls.push(['upload', ...args]) },
      mkdir: (dir) => calls.push(['mkdir', dir]),
      copy: (src, dst) => calls.push(['copy', src, dst]),
      join: (a, b) => a + '/' + b,
      basename: (p) => p.split('/').pop(),
      stat: () => ({ size: 2048 }),
      now: 1000,
      debugLog: (m) => calls.push(['log', m]),
      ...overrides,
    },
  }
}

test('Windows 路径先复制到 WSL，再上传', async () => {
  const h = harness()
  const r = await sendFileTo(h.deps)
  assert.equal(h.calls.some((c) => c[0] === 'mkdir'), true)
  assert.equal(h.calls.some((c) => c[0] === 'copy'), true)
  const upload = h.calls.find((c) => c[0] === 'upload')
  assert.match(upload[4], /^\/tmp\/qq-send\//)
  assert.match(r, /已发送文件：a.txt（2 KB）/)
})

test('Linux 路径不复制', async () => {
  const h = harness({ file: '/tmp/a.txt' })
  await sendFileTo(h.deps)
  assert.equal(h.calls.some((c) => c[0] === 'copy'), false)
  assert.equal(h.calls.find((c) => c[0] === 'upload')[4], '/tmp/a.txt')
})

test('限流拒绝抛错', async () => {
  const h = harness({ gate: { run: async () => ({ ok: false, reason: 'too many' }) } })
  await assert.rejects(() => sendFileTo(h.deps), /发送被限流：too many/)
})

test('复制失败仍用原始路径', async () => {
  const h = harness({ copy: () => { throw new Error('wsl') } })
  await sendFileTo(h.deps)
  assert.equal(h.calls.some((c) => c[0] === 'log' && /wsl file copy failed/.test(c[1])), true)
  assert.equal(h.calls.find((c) => c[0] === 'upload')[4], 'D:/a.txt')
})
