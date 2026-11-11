import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareImageForSend } from '../lib/services/image-compress.js'

function harness(overrides = {}) {
  const calls = []
  const sizes = { 'D:/a.jpg': 5 * 1024 * 1024, 'D:/media/img-x.jpg': 1024 }
  return {
    calls,
    deps: {
      file: 'D:/a.jpg',
      config: {},
      mediaDir: 'D:/media',
      stat: (f) => ({ size: f.includes('img-') ? 1024 : (sizes[f] ?? 0) }),
      mkdir: (d) => calls.push(['mkdir', d]),
      rm: (f) => calls.push(['rm', f]),
      execFile: (cmd, args, opts, cb) => cb(null),
      join: (a, b) => a + '/' + b,
      now: 1000,
      debugLog: (m) => calls.push(['log', m]),
      ...overrides,
    },
  }
}

test('小图原样返回', async () => {
  const h = harness({ file: 'D:/small.jpg' })
  h.deps.stat = () => ({ size: 1024 })
  assert.equal(await prepareImageForSend(h.deps), 'D:/small.jpg')
  assert.equal(h.calls.length, 0)
})

test('大图压缩成功返回新路径', async () => {
  const h = harness()
  const out = await prepareImageForSend(h.deps)
  assert.match(out, /img-.*\.jpg$/)
  assert.equal(h.calls.some((c) => c[0] === 'log' && /image compressed/.test(c[1])), true)
})

test('压缩后没变小：删除并保留原图', async () => {
  const h = harness()
  h.deps.stat = (f) => (f.includes('img-') ? { size: 9 * 1024 * 1024 } : { size: 5 * 1024 * 1024 })
  assert.equal(await prepareImageForSend(h.deps), 'D:/a.jpg')
  assert.equal(h.calls.some((c) => c[0] === 'rm'), true)
})

test('stat 抛错 / ffmpeg 失败都保留原图', async () => {
  const bad = harness({ stat: () => { throw new Error('io') } })
  assert.equal(await prepareImageForSend(bad.deps), 'D:/a.jpg')

  const ff = harness({ execFile: (cmd, args, opts, cb) => cb(new Error('no ffmpeg')) })
  assert.equal(await prepareImageForSend(ff.deps), 'D:/a.jpg')
})
