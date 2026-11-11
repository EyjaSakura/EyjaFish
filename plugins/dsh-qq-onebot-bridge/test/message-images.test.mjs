import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { downloadMessageImages } from '../lib/services/message-images.js'

function harness(overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'imgs-'))
  const deps = {
    message: { images: [] },
    imageDir: dir,
    config: { visionMode: 'native', visionEnabled: true },
    downloadTo: async () => join(dir, 'downloaded.png'),
    extractGifFrame: async () => null,
    imageBlocksFor: async (files) => files.map((f) => ({ type: 'image', path: f })),
    debugLog: () => {},
    now: () => 1000,
    ...overrides,
  }
  return { deps, dir }
}

test('空图片返回空 note/blocks', async () => {
  const { deps } = harness()
  assert.deepEqual(await downloadMessageImages(deps), { note: '', blocks: [] })
})

test('HTTP 图片下载成功 + native blocks', async () => {
  const { deps, dir } = harness({ message: { images: [{ url: 'https://x/a.png' }] } })
  const out = await downloadMessageImages(deps)
  assert.match(out.note, /图片已保存/)
  assert.equal(out.blocks.length, 1)
  assert.equal(out.blocks[0].type, 'image')
})

test('HTTP 下载失败给出说明', async () => {
  const { deps } = harness({
    message: { images: [{ url: 'https://x/a.png' }] },
    downloadTo: async () => { throw new Error('boom') },
  })
  const out = await downloadMessageImages(deps)
  assert.match(out.note, /下载失败/)
})

test('本地文件复制 / 不存在 / mface', async () => {
  const { deps, dir } = harness()
  const src = join(dir, 'src.png')
  writeFileSync(src, 'png')
  const ok = await downloadMessageImages({ ...deps, message: { images: [{ path: src }] } })
  assert.match(ok.note, /图片已保存/)
  assert.ok(readdirSync(deps.imageDir).some((name) => name.startsWith('msg-img-')))

  const missing = await downloadMessageImages({ ...deps, message: { images: [{ path: join(dir, 'none.png') }] } })
  assert.match(missing.note, /无图片链接|读取失败/)

  const mface = await downloadMessageImages({ ...deps, message: { images: [{ kind: 'mface', summary: '猫猫' }] } })
  assert.match(mface.note, /动画表情.*猫猫/)
})

test('vision 关闭时不生成 blocks', async () => {
  const { deps } = harness({
    config: { visionMode: 'native', visionEnabled: false },
    message: { images: [{ url: 'https://x/a.png' }] },
  })
  const out = await downloadMessageImages(deps)
  assert.deepEqual(out.blocks, [])
})

test('最多处理 4 张', async () => {
  const { deps } = harness({
    message: { images: Array.from({ length: 6 }, (_, i) => ({ url: `https://x/${i}.png` })) },
  })
  const out = await downloadMessageImages(deps)
  assert.equal(out.blocks.length, 4)
})
