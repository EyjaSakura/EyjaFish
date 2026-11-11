import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pollQzoneComments, maybeAutoPostQzone } from '../lib/services/qzone-poller.js'

function dirs() {
  const root = mkdtempSync(join(tmpdir(), 'qzone-poll-'))
  return { root, memoryDir: join(root, 'memory') }
}

const list = [{ tid: 'p1', commentlist: [{ tid: 'c1', uin: '7', content: '好看' }] }]

test('评论轮询：关闭时不动', async () => {
  let fetched = false
  await pollQzoneComments({
    config: { qzoneAutoReply: false }, memoryDir: dirs().memoryDir,
    fetchList: async () => { fetched = true; return { list, uin: '9' } },
    ownerQQ: () => 10001, setSelfState: () => {}, handleInjection: async () => {},
  })
  assert.equal(fetched, false)
})

test('评论轮询：有新评论时注入并写 seen', async () => {
  const { root, memoryDir } = dirs()
  const calls = []
  const config = { qzoneAutoReply: true, qzonePollCount: 5, injectDryRun: true }
  await pollQzoneComments({
    config, memoryDir,
    fetchList: async () => ({ list, uin: '9' }),
    ownerQQ: () => 10001,
    setSelfState: (...a) => calls.push(['state', ...a]),
    handleInjection: async (type, payload) => calls.push(['inject', type, payload]),
    now: () => 1000,
  })
  assert.equal(calls.filter((c) => c[0] === 'inject').length, 1)
  assert.equal(config.injectDryRun, true)
  const seen = JSON.parse(readFileSync(join(root, 'qq-qzone-seen.json'), 'utf8'))
  assert.ok(seen.includes('p1:c1'))
})

test('评论轮询：无 owner 只写 seen', async () => {
  const { root, memoryDir } = dirs()
  let injected = 0
  await pollQzoneComments({
    config: {}, memoryDir,
    fetchList: async () => ({ list, uin: '9' }),
    ownerQQ: () => 0,
    setSelfState: () => {},
    handleInjection: async () => { injected += 1 },
  })
  assert.equal(injected, 0)
  assert.ok(readFileSync(join(root, 'qq-qzone-seen.json'), 'utf8').includes('p1:c1'))
})

test('评论轮询：抓取失败不抛', async () => {
  const { memoryDir } = dirs()
  await pollQzoneComments({
    config: {}, memoryDir,
    fetchList: async () => { throw new Error('net') },
    ownerQQ: () => 1, setSelfState: () => {}, handleInjection: async () => {},
  })
})

test('自动说说：无 owner / 到点注入', async () => {
  const { root, memoryDir } = dirs()
  await maybeAutoPostQzone({ config: {}, memoryDir, ownerQQ: () => 0, handleInjection: async () => {} })

  const calls = []
  const config = { injectDryRun: true }
  await maybeAutoPostQzone({
    config, memoryDir,
    ownerQQ: () => 10001,
    handleInjection: async (type, payload) => calls.push(payload),
    now: new Date(2026, 10, 9, 12),
  })
  assert.equal(calls.length, 1)
  assert.match(calls[0].text, /空间说说/)
  assert.equal(config.injectDryRun, true)
  assert.ok(readFileSync(join(root, 'qq-qzone-autopost.json'), 'utf8').includes('nextAt'))
})

test('自动说说：注入失败不抛', async () => {
  const { memoryDir } = dirs()
  await maybeAutoPostQzone({
    config: {}, memoryDir, ownerQQ: () => 1,
    handleInjection: async () => { throw new Error('boom') },
    now: new Date(2026, 10, 9, 12),
  })
})
