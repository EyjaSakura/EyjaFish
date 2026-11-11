import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { maaNotifyTick } from '../lib/services/maa-notify.js'

const validJob = (extra = {}) => ({
  id: 'job-20261109-101010-1',
  status: 'done',
  task: 'Fight',
  durationMs: 12345,
  shots: [],
  ...extra,
})

function harness(job, overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'maa-'))
  if (job !== undefined) writeFileSync(join(dir, 'job.json'), JSON.stringify(job))
  const calls = []
  const deps = {
    maaData: dir,
    server: {
      currentSocket: () => 'sock',
      sendText: async (...a) => calls.push(['text', ...a]),
    },
    ownerQQ: () => 10001,
    sendImageTo: async (...a) => calls.push(['image', ...a]),
    debugLog: () => {},
    ...overrides,
  }
  return { deps, dir, calls }
}

test('没有 job / 坏 JSON / 非法 id / running 都跳过', async () => {
  const none = harness(undefined)
  await maaNotifyTick(none.deps)
  assert.equal(none.calls.length, 0)

  const bad = harness(undefined)
  writeFileSync(join(bad.dir, 'job.json'), 'not json')
  await maaNotifyTick(bad.deps)
  assert.equal(bad.calls.length, 0)

  const invalid = harness(validJob({ id: 'bad' }))
  await maaNotifyTick(invalid.deps)
  assert.equal(invalid.calls.length, 0)

  const running = harness(validJob({ status: 'running' }))
  await maaNotifyTick(running.deps)
  assert.equal(running.calls.length, 0)
})

test('完成且无截图：发文字并写 notified', async () => {
  const { deps, dir, calls } = harness(validJob())
  await maaNotifyTick(deps)
  assert.equal(calls[0][0], 'text')
  assert.ok(existsSync(join(dir, 'notified.json')))
  const notified = JSON.parse(readFileSync(join(dir, 'notified.json'), 'utf8'))
  assert.equal(notified.status, 'done')
})

test('有截图：发图成功不回落文字', async () => {
  const { deps, dir, calls } = harness(validJob())
  const shot = join(dir, 'shot.png')
  writeFileSync(shot, 'png')
  writeFileSync(join(dir, 'job.json'), JSON.stringify(validJob({ shots: [shot] })))
  await maaNotifyTick(deps)
  assert.equal(calls[0][0], 'image')
  assert.equal(calls.some((c) => c[0] === 'text'), false)
})

test('发图失败回落到文字', async () => {
  const { deps, dir } = harness(validJob(), {
    sendImageTo: async () => { throw new Error('bad image') },
  })
  const shot = join(dir, 'shot.png')
  writeFileSync(shot, 'png')
  writeFileSync(join(dir, 'job.json'), JSON.stringify(validJob({ shots: [shot] })))
  const calls = []
  deps.server.sendText = async (...a) => calls.push(a)
  await maaNotifyTick(deps)
  assert.equal(calls.length, 1)
})

test('无连接 / 已通知：不重复发', async () => {
  const off = harness(validJob(), { server: { currentSocket: () => null, sendText: async () => {} } })
  await maaNotifyTick(off.deps)
  assert.equal(off.calls.length, 0)

  const twice = harness(validJob())
  await maaNotifyTick(twice.deps)
  const before = twice.calls.length
  await maaNotifyTick(twice.deps)
  assert.equal(twice.calls.length, before)
})
