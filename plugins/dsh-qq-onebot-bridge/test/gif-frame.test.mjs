import test from 'node:test'
import assert from 'node:assert/strict'
import { extractGifFrame } from '../lib/services/gif-frame.js'

function harness(overrides = {}) {
  const logs = []
  return {
    logs,
    deps: {
      file: 'D:/a.gif',
      config: { gifFrameExtract: true },
      exists: () => false,
      execFile: (cmd, args, opts, cb) => cb(null),
      debugLog: (m) => logs.push(m),
      ...overrides,
    },
  }
}

test('未开启 / 非 gif 返回 null', async () => {
  assert.equal(await extractGifFrame(harness({ config: {} }).deps), null)
  assert.equal(await extractGifFrame(harness({ file: 'D:/a.png' }).deps), null)
})

test('已有首帧直接复用', async () => {
  const h = harness({ exists: () => true })
  assert.equal(await extractGifFrame(h.deps), 'D:/a-frame.png')
})

test('ffmpeg 成功且生成文件', async () => {
  const h = harness({ exists: (f) => f.endsWith('-frame.png') })
  assert.equal(await extractGifFrame(h.deps), 'D:/a-frame.png')
})

test('ffmpeg 失败返回 null 并记日志', async () => {
  const h = harness({ execFile: (cmd, args, opts, cb) => cb(new Error('no ffmpeg')) })
  assert.equal(await extractGifFrame(h.deps), null)
  assert.match(h.logs[0], /gif frame extract failed/)
})
