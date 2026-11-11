import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDouyinPrompt } from '../lib/services/douyin-prompt.js'

const base = { label: '薇薇安（姐姐）', nick: '薇薇安', text: '你好', voiceText: '', images: [] }

test('文本消息', () => {
  const p = buildDouyinPrompt({ item: {}, ...base })
  assert.match(p, /【抖音私信】/)
  assert.match(p, /薇薇安/)
  assert.match(p, /你好/)
  assert.match(p, /douyin_send/)
})

test('图片消息：提示附图', () => {
  const p = buildDouyinPrompt({ item: {}, ...base, images: ['/a.png', '/b.png'] })
  assert.match(p, /2 张图片/)
  assert.match(p, /直接看/)
})

test('语音：转写成功', () => {
  const p = buildDouyinPrompt({ item: { voicePath: 'v.mpeg' }, ...base, voiceText: '在吗' })
  assert.match(p, /发来一条语音/)
  assert.match(p, /在吗/)
})

test('语音：转写失败', () => {
  const p = buildDouyinPrompt({ item: { voicePath: 'v.mpeg' }, ...base, voiceText: '' })
  assert.match(p, /没能转写/)
  assert.match(p, /没听清/)
})

test('视频：本地文件', () => {
  const p = buildDouyinPrompt({ item: { videoPath: 'x.mp4' }, ...base })
  assert.match(p, /分享了一个视频/)
  assert.match(p, /x\.mp4/)
  assert.match(p, /douyin_analyze_video/)
})

test('视频：URL', () => {
  const p = buildDouyinPrompt({ item: { videoUrl: 'https://v.douyin.com/x' }, ...base })
  assert.match(p, /https:\/\/v\.douyin\.com\/x/)
})
