import test from 'node:test'
import assert from 'node:assert/strict'
import { liveCapabilityBlock } from '../lib/services/live-perms.js'

function deps(overrides = {}) {
  return {
    config: {},
    surface: { subject: 'u:123' },
    exec: { name: 'qq_send_image' },
    exists: () => false,
    readFile: () => '{}',
    debugLog: () => {},
    ...overrides,
  }
}

test('空工具名不拦', () => {
  assert.equal(liveCapabilityBlock(deps({ exec: {} })), undefined)
})

test('全局关闭：发图 / 发文件 / 语音 / 表情 / 改资料 / 空间', () => {
  const cases = [
    ['qq_send_image', { imageSendEnabled: false }, '发图片'],
    ['qq_send_file', { fileSendEnabled: false }, '发文件'],
    ['qq_send_voice', { voiceSendEnabled: false }, '发语音'],
    ['qq_face_send', { faceToolsEnabled: false }, '表情包'],
    ['qq_set_nickname', { selfProfileEnabled: false }, '改资料'],
    ['qq_post_qzone', { qzoneEnabled: false }, 'QQ空间'],
  ]
  for (const [name, config, cap] of cases) {
    const msg = liveCapabilityBlock(deps({ exec: { name }, config }))
    assert.match(msg, new RegExp(cap))
  }
})

test('文件 / 命令工具按类别拦截', () => {
  assert.match(liveCapabilityBlock(deps({ exec: { name: 'read' }, config: { fsReadEnabled: false } })), /读文件/)
  assert.match(liveCapabilityBlock(deps({ exec: { name: 'write' }, config: { fsWriteEnabled: false } })), /写文件/)
  assert.match(liveCapabilityBlock(deps({ exec: { name: 'bash' }, config: { shellEnabled: false } })), /执行命令/)
})

test('每用户覆盖：文件里 false 优先', () => {
  const msg = liveCapabilityBlock(deps({
    exec: { name: 'read' },
    config: { perUserPermsFile: 'perms.json' },
    exists: () => true,
    readFile: () => JSON.stringify({ 123: { fsRead: false } }),
  }))
  assert.match(msg, /读文件/)
})

test('未关闭 / 坏 JSON 返回 undefined', () => {
  assert.equal(liveCapabilityBlock(deps({ config: { imageSendEnabled: true } })), undefined)
  assert.equal(liveCapabilityBlock(deps({
    config: { perUserPermsFile: 'x' },
    exists: () => true,
    readFile: () => 'not json',
  })), undefined)
})
