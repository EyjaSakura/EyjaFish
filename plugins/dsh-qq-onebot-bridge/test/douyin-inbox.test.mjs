import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pollDouyinInbox } from '../lib/services/douyin-inbox.js'

const tick = () => new Promise((resolve) => setImmediate(resolve))

function setup(lines = [], config = { peers: {} }) {
  const dir = mkdtempSync(join(tmpdir(), 'douyin-'))
  const inbox = join(dir, 'dm-inbox.jsonl')
  const offsetFile = join(dir, 'offset.json')
  const configFile = join(dir, 'config.json')
  writeFileSync(inbox, lines.join('\n'))
  writeFileSync(configFile, JSON.stringify(config))
  return { dir, inbox, offsetFile, configFile }
}

function deps(files, overrides = {}) {
  const calls = []
  const targets = []
  return {
    calls,
    targets,
    deps: {
      inbox: files.inbox,
      offsetFile: files.offsetFile,
      configFile: files.configFile,
      ownerQQ: () => 10001,
      transcribe: async () => '语音文字',
      handleInjection: async (kind, frame) => { calls.push(frame) },
      setReplyTarget: (t) => targets.push(t),
      config: { injectDryRun: true },
      debugLog: () => {},
      now: () => 1000,
      ...overrides,
    },
  }
}

test('无 inbox 直接返回', async () => {
  const files = setup([])
  files.inbox = join(files.dir, 'none.jsonl')
  const { deps: d, calls } = deps(files)
  await pollDouyinInbox(d)
  assert.equal(calls.length, 0)
})

test('文本 / 媒体 / 坏行：只注入有效项并写 offset', async () => {
  const files = setup([
    JSON.stringify({ peer: 'A', text: '你好' }),
    'not json',
    JSON.stringify({ peer: 'B', images: ['x.jpg'] }),
    JSON.stringify({ peer: 'C', text: '   ' }),
  ], { peers: { A: { note: '朋友', qq: '123' } } })
  const h = deps(files)
  await pollDouyinInbox(h.deps)
  await tick()
  assert.equal(h.calls.length, 2)
  assert.match(h.calls[0].text, /朋友/)
  assert.deepEqual(h.calls[1].images, ['x.jpg'])
  const offset = JSON.parse(readFileSync(files.offsetFile, 'utf8'))
  assert.equal(offset.offset > 0, true)
  assert.equal(h.deps.config.injectDryRun, true)
})

test('无 owner 不注入', async () => {
  const files = setup([JSON.stringify({ peer: 'A', text: '你好' })])
  const h = deps(files, { ownerQQ: () => 0 })
  await pollDouyinInbox(h.deps)
  await tick()
  assert.equal(h.calls.length, 0)
  assert.equal(h.targets.length, 0)
})

test('语音转写成功 / 失败', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'douyin-'))
  const voice = join(dir, 'a.mp3')
  writeFileSync(voice, 'abc')
  const files = setup([JSON.stringify({ peer: 'A', voicePath: voice })])
  const ok = deps(files)
  await pollDouyinInbox(ok.deps)
  await tick()
  assert.equal(ok.calls.length, 1)
  assert.match(ok.calls[0].text, /语音文字/)

  const badFiles = setup([JSON.stringify({ peer: 'A', voicePath: voice })])
  const bad = deps(badFiles, { transcribe: async () => { throw new Error('stt') } })
  await pollDouyinInbox(bad.deps)
  await tick()
  assert.equal(bad.calls.length, 1)
})

test('offset 已到末尾不重复', async () => {
  const files = setup([JSON.stringify({ peer: 'A', text: '你好' })])
  const h = deps(files)
  await pollDouyinInbox(h.deps)
  await tick()
  const before = h.calls.length
  await pollDouyinInbox(h.deps)
  await tick()
  assert.equal(h.calls.length, before)
})
